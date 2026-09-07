import type { BilanAirFreightRow, BilanShipment } from "./bilan-readers-contracts";
import type { CohortId, ShipmentContext, ShipmentGroup } from "./bilan-contracts";
import { resolveCohort } from "./cohort-registry";
import { parseShipmentGroups } from "./shipment-groups";

export type AirFreightAllocation = Readonly<{
  sourceReference: string; date: string; company: string; destination: "FIH" | "LSHI";
  cohortWeightKg: number; amountUsd: number; officialAmountUsd: number; physicalMonth: string;
}>;

const DOCUMENTARY_COMPLETIONS = Object.freeze([
  Object.freeze({ sourceRow: 89, company: "ETHIOPIAN", destination: "LSHI" as const, groupLabels: Object.freeze(["GROUPAGE 005", "GROUPAGE 008"]), expectedWeightKg: 62 })
]);

export function aggregateAirFreight(rows: readonly BilanAirFreightRow[], shipments: readonly BilanShipment[], cohortId: CohortId) {
  const allocations: AirFreightAllocation[] = [];
  const anomalies: string[] = [];
  for (const row of rows) {
    const context: ShipmentContext = { company: row.company, destination: row.destination, shipmentDate: row.date, sourceSheet: row.sourceSheet, sourceRow: row.sourceRow };
    const parsed = parseShipmentGroups(row.details, context);
    const groups = [...parsed.groups, ...documentaryCompletion(row, shipments, parsed.groups, anomalies)];
    if (parsed.anomalies.length) anomalies.push(...parsed.anomalies.map((item) => `${row.sourceSheet}!${row.sourceRow}: ${item.code}.`));
    if (groups.length !== row.declaredGroupCount) anomalies.push(`${row.sourceSheet}!${row.sourceRow}: ${groups.length}/${row.declaredGroupCount} groupages résolus.`);
    const parcels = groups.flatMap((group) => group.parcels);
    if (!parcels.length) { anomalies.push(`${row.sourceSheet}!${row.sourceRow}: aucun colis pondéré résolu.`); continue; }
    const unresolvedCodes = parcels.filter((parcel) => resolveCohort(parcel.identity.rawCode).state === "UNRESOLVED");
    if (unresolvedCodes.length) anomalies.push(`${row.sourceSheet}!${row.sourceRow}: ${unresolvedCodes.length} code(s) sans mois d’origine.`);
    const cohorts = new Set(parcels.map((parcel) => resolveCohort(parcel.identity.rawCode)).flatMap((resolution) => resolution.state === "RESOLVED" ? [resolution.definition.id] : []));
    const cohortWeightKg = parcels.reduce((sum, parcel) => {
      const resolution = resolveCohort(parcel.identity.rawCode);
      return sum + (resolution.state === "RESOLVED" && resolution.definition.id === cohortId ? parcel.weightKg : 0);
    }, 0);
    if (!cohortWeightKg) continue;
    const amountUsd = cohorts.size === 1 ? row.amountUsd : cohortWeightKg * row.rateUsdPerKg;
    allocations.push(Object.freeze({ sourceReference: `${row.sourceSheet}!${row.sourceRow}`, date: row.date, company: row.company, destination: row.destination, cohortWeightKg, amountUsd: money(amountUsd), officialAmountUsd: row.amountUsd, physicalMonth: row.date.slice(0, 7) }));
  }
  const byAgencyCompany = { FIH: companyTotals(allocations, "FIH"), LSHI: companyTotals(allocations, "LSHI") };
  const byAgency = { FIH: sum(Object.values(byAgencyCompany.FIH)), LSHI: sum(Object.values(byAgencyCompany.LSHI)), KLZ: 0 } as const;
  const selectedMonth = cohortId;
  const physicalMonthUsd = sum(allocations.filter((item) => item.physicalMonth === selectedMonth).map((item) => item.amountUsd));
  const laterMonthUsd = sum(allocations.filter((item) => item.physicalMonth > selectedMonth).map((item) => item.amountUsd));
  return Object.freeze({ status: anomalies.length ? "PROVISOIRE" as const : "CERTIFIE" as const, byAgency: Object.freeze(byAgency), byAgencyCompany: Object.freeze(byAgencyCompany), totalUsd: money(byAgency.FIH + byAgency.LSHI), physicalMonthUsd, laterMonthUsd, allocations: Object.freeze(allocations), anomalies: Object.freeze(anomalies) });
}

function documentaryCompletion(row: BilanAirFreightRow, shipments: readonly BilanShipment[], current: readonly ShipmentGroup[], anomalies: string[]) {
  const rule = DOCUMENTARY_COMPLETIONS.find((item) => item.sourceRow === row.sourceRow && item.company === row.company && item.destination === row.destination);
  if (!rule || current.length === row.declaredGroupCount) return [];
  const labels = new Set(rule.groupLabels);
  const nextDay = new Date(`${row.date}T00:00:00Z`); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const allowedDates = new Set([row.date, nextDay.toISOString().slice(0, 10)]);
  const candidates = shipments.flatMap((shipment) => shipment.company === row.company && shipment.destination === row.destination && allowedDates.has(shipment.date) ? shipment.groups.filter((group) => labels.has(group.canonicalLabel)) : []);
  const unique = rule.groupLabels.map((label) => candidates.filter((group) => group.canonicalLabel === label)).filter((groups) => groups.length === 1).map(([group]) => group);
  const weight = unique.flatMap((group) => group.parcels).reduce((total, parcel) => total + parcel.weightKg, 0);
  if (unique.length !== rule.groupLabels.length || weight !== rule.expectedWeightKg || current.length + unique.length !== row.declaredGroupCount) {
    anomalies.push(`${row.sourceSheet}!${row.sourceRow}: complément documentaire non certifiable.`);
    return [];
  }
  return unique;
}

function companyTotals(items: readonly AirFreightAllocation[], agency: "FIH" | "LSHI") {
  return Object.freeze(Object.fromEntries(["ETHIOPIAN", "ASKY", "DHL"].map((company) => [company, sum(items.filter((item) => item.destination === agency && item.company === company).map((item) => item.amountUsd))])) as Record<"ETHIOPIAN" | "ASKY" | "DHL", number>);
}
function sum(values: readonly number[]) { return money(values.reduce((total, value) => total + value, 0)); }
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
