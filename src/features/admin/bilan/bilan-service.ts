import "server-only";

import type { AdminAuthorizationResult } from "@/server/admin-authorization";
import { readCanonicalManifestRange, readAdminManifestRange } from "@/server/admin-manifest-sheets";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { readAdminExpenses } from "@/server/agent-expenses-apps-script";

import { aggregateCohortActivity } from "./activity-aggregations";
import type { BilanApiQuery } from "./bilan-api-query";
import type { AggregatedQualityIssue, CohortDirectCost } from "./bilan-aggregation-contracts";
import type { BilanRangeRead, BilanRangeReader } from "./bilan-readers-contracts";
import { aggregatePeriodExpenses, calculateDirectMargin, resultOperationalPeriodUsd } from "./expense-aggregations";
import { readBilanExpenses, readBilanPayments } from "./financial-readers";
import { readBilanManifestParcels, readBilanOfficialTransit, readBilanShipments, reconcileOfficialTransit } from "./manifest-readers";
import { aggregateCohortPayments, aggregatePeriodReceiptsUsd } from "./payment-aggregations";
import { aggregateReadAnomalies } from "./quality-aggregations";
import { calculateDeclarantDirectCosts, calculateLshiDhlDeclarantDirectCosts, calculateTransitDirectCosts, summarizeOfficialTransit, summarizeShipmentStructure } from "./shipment-aggregations";
import { aggregateShipmentByAgency } from "./shipment-by-agency";

type AuthorizedAdmin = Extract<AdminAuthorizationResult, { authorized: true }>;

const sheetsSource: BilanRangeReader = Object.freeze({
  mode: "READ_ONLY",
  read: (request: BilanRangeRead) => request.spreadsheet === "MANIFESTE_PUBLIC"
    ? readAdminManifestRange(request.range)
    : readCanonicalManifestRange(request.range)
});

export async function buildAdminBilan(query: BilanApiQuery, admin: AuthorizedAdmin) {
  const [fih, lshi, klz, shipmentsRead, officialRead, paymentsRead, expensesRead] = await Promise.all([
    readBilanManifestParcels(sheetsSource, "FIH"), readBilanManifestParcels(sheetsSource, "LSHI"), readBilanManifestParcels(sheetsSource, "KLZ"),
    readBilanShipments(sheetsSource), readBilanOfficialTransit(sheetsSource), readBilanPayments(() => readAdminPayments()),
    query.period ? readBilanExpenses(() => readAllExpenses(admin, query.period!)) : Promise.resolve({ rows: [], anomalies: [] } as const)
  ]);
  if ([fih, lshi, klz, shipmentsRead, officialRead, paymentsRead, expensesRead].some((read) => read.anomalies.some((anomaly) => anomaly.code === "SOURCE_INDISPONIBLE"))) {
    throw new Error("BILAN_SOURCE_UNAVAILABLE");
  }
  const manifestRows = [...fih.rows, ...lshi.rows, ...klz.rows];
  const activity = aggregateCohortActivity(manifestRows, query.cohort.id, query.period);
  const shipment = aggregateShipmentByAgency(manifestRows, shipmentsRead.rows, query.cohort.id);
  const shipmentStructure = summarizeShipmentStructure(shipmentsRead.rows, query.cohort.id);
  const payments = aggregateCohortPayments(paymentsRead.rows, query.cohort.id);
  const reconciliation = reconcileOfficialTransit(officialRead.rows, shipmentsRead.rows);
  const transit = summarizeOfficialTransit(officialRead.rows);
  const directCosts = [...calculateDeclarantDirectCosts(shipmentsRead.rows), ...calculateLshiDhlDeclarantDirectCosts(reconciliation.matches), ...calculateTransitDirectCosts(reconciliation.matches)];
  const periodExpenses = query.period ? aggregatePeriodExpenses(expensesRead.rows, query.period) : null;
  const quality = collectQuality(query, { fih, lshi, klz, shipmentsRead, officialRead, paymentsRead, expensesRead }, activity.anomalies, shipment.qualityIssues, payments.anomalies, periodExpenses?.anomalies ?? []);
  const cohortCosts = directCosts.filter((cost) => cost.cohortId === query.cohort.id);
  const unallocated = [...directCosts.filter((cost) => cost.status === "NON IMPUTÉ"), ...(periodExpenses?.directCostsUnallocated ?? [])];
  const globalStatus = reconciliation.missing.length || reconciliation.ambiguous.length ? "PARTIEL" : unallocated.length || payments.historicalRevenueStatus === "NON CERTIFIÉ" ? "PROVISOIRE" : "CERTIFIE";
  const receivedPeriodUsd = query.period ? aggregatePeriodReceiptsUsd(paymentsRead.rows, query.period) : null;
  return deepFreeze({
    meta: {
      cohort: query.cohort.prefix, cohortId: query.cohort.id, cohortYear: query.cohort.year, cohortMonth: query.cohort.month,
      period: query.period, calculatedAt: new Date().toISOString(), status: globalStatus,
      sources: ["MANIFESTE D’EXPÉDITION COO", "MANIFESTE PUBLIC / STATISTIQUES DES EXPÉDITIONS", "ENCAISSEMENTS", ...(query.period ? ["DÉPENSES"] : [])]
    },
    activity: {
      FIH: exposeAgency(activity.agencies.FIH), LSHI: exposeAgency(activity.agencies.LSHI), KLZ: exposeAgency(activity.agencies.KLZ),
      totalCohortWeightKg: activity.cohortWeightKg, periodRegisteredWeightKg: activity.periodWeightKg, cohortPeriodDifferenceKg: activity.scopeDifferenceKg
    },
    shipment: {
      registeredCohortWeightKg: shipment.total.registeredWeightKg,
      certifiedShippedWeightKg: shipment.total.certifiedShippedWeightKg,
      remainingWeightKg: shipment.total.remainingWeightKg,
      status: shipment.total.status,
      anomalies: shipment.total.anomalies,
      byAgency: {
        FIH: { ...shipment.FIH, ...shipmentStructure.FIH },
        LSHI: { ...shipment.LSHI, ...shipmentStructure.LSHI },
        KLZ: { ...shipment.KLZ, ...shipmentStructure.KLZ }
      }
    },
    payments: { ...payments, remainingAmount: payments.collectionRate === null ? null : round(payments.recordedExpectedAmount - payments.receivedAmount) },
    directCosts: summarizeDirectCosts(cohortCosts, unallocated),
    transit: { ...transit, rateUsdPerKg: 1.7, cohortAllocatedAmountUsd: cents(cohortCosts.filter((cost) => cost.kind === "TRANSIT_FIH_LSHI")), status: reconciliation.missing.length || reconciliation.ambiguous.length ? "PARTIEL" : "CERTIFIE", additionalFihProofRequired: false },
    periodExpenses: periodExpenses ? { byCategoryAndCurrency: periodExpenses.operationalByCategoryAndCurrency, byCurrency: periodExpenses.operationalByCurrency } : null,
    treasury: periodExpenses ? { tfBeninByCurrency: periodExpenses.tfBeninByCurrency, revenue: false, deductibleExpense: false, treasury: true, remainingToTransfer: null } : null,
    results: {
      RESULTAT_OPERATIONNEL_PERIODE_USD: periodExpenses && receivedPeriodUsd !== null ? resultOperationalPeriodUsd(receivedPeriodUsd, periodExpenses) : null,
      directMargin: calculateDirectMargin({ historicalRevenueUsd: null, certifiedDirectCostsUsd: cents(cohortCosts), hasUnallocatedDirectCosts: unallocated.length > 0 })
    },
    dataQuality: quality
  });
}

async function readAllExpenses(admin: AuthorizedAdmin, period: { from: string; to: string }) {
  const identity = { userId: admin.userId, email: admin.email, agency: admin.agency };
  const first = await readAdminExpenses(identity, { dateDebut: period.from, dateFin: period.to, page: 1, pageSize: 100 });
  if (first.pagination.totalPages <= 1) return first.depenses;
  const rest = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => readAdminExpenses(identity, { dateDebut: period.from, dateFin: period.to, page: index + 2, pageSize: 100 })));
  return [...first.depenses, ...rest.flatMap((page) => page.depenses)];
}

function collectQuality(query: BilanApiQuery, reads: Record<string, { anomalies: readonly { code: string; source: string; rowNumber?: number; message: string }[] }>, ...aggregated: readonly (readonly AggregatedQualityIssue[])[]) {
  const readIssues = Object.values(reads).flatMap((read) => aggregateReadAnomalies(read.anomalies as never, { cohortId: query.cohort.id, impact: "Résultat BILAN partiel ou non calculable." }));
  return [...readIssues, ...aggregated.flat()];
}
function exposeAgency(value: { occurrences: number; certifiedUniqueIdentities: number; cohortWeightKg: number }) { return { occurrences: value.occurrences, uniqueIdentities: value.certifiedUniqueIdentities, cohortWeightKg: value.cohortWeightKg }; }
function summarizeDirectCosts(allocated: readonly CohortDirectCost[], unallocated: readonly CohortDirectCost[]) {
  const byKind = (kind: CohortDirectCost["kind"]) => cents(allocated.filter((cost) => cost.kind === kind));
  return { declarantLshiUsd: byKind("DECLARANT_LSHI_GROUP"), declarantLshiDhlUsd: byKind("DECLARANT_LSHI_DHL_WEIGHT"), declarantFihStandardUsd: byKind("DECLARANT_FIH_STANDARD_GROUP"), declarantFihDhlUsd: byKind("DECLARANT_FIH_DHL_WEIGHT"), transitFihLshiUsd: byKind("TRANSIT_FIH_LSHI"), expeditionKlzUsd: byKind("EXPEDITION_KLZ"), otherCertifiedUsd: 0, totalAllocatedUsd: cents(allocated), totalUnallocatedUsd: cents(unallocated), allocated, unallocated };
}
function cents(costs: readonly CohortDirectCost[]) { return round(costs.reduce((sum, cost) => sum + cost.amountCents / 100, 0)); }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
