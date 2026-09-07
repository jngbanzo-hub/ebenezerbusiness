export const BILAN_COHORT_OPTIONS = Object.freeze([
  { prefix: "JL", label: "Juillet 2026", year: 2026, month: 7 },
  { prefix: "AT", label: "Août 2026", year: 2026, month: 8 },
  { prefix: "SE", label: "Septembre 2026", year: 2026, month: 9 }
] as const);

export type BilanStatus = "CERTIFIE" | "PROVISOIRE" | "PARTIEL" | "NON_CALCULABLE" | "NON IMPUTÉ" | "ANOMALIE" | string;
export type CurrencyTotals = Record<string, number>;
export type ShipmentAgencyAnomaly = { type: string; sourceRawCode: string | null; shipmentRawCode: string | null; sourceReference: string | null; shipmentReferences: string[]; registeredWeightKg: number | null; shipmentWeightsKg: number[] };
export type ShipmentAgencyMetrics = { registeredWeightKg: number; certifiedShippedWeightKg: number; remainingWeightKg: number; status: BilanStatus; anomalies: ShipmentAgencyAnomaly[]; certifiedIdentities: Array<{ sourceRawCode: string; shipmentRawCode: string; canonicalParcelCode: string; agency: "FIH" | "LSHI" | "KLZ"; resolutionType: "EXACT" | "KLZ_SUFFIX_PROJECTION" | "PDG_CERTIFIED_IDENTITY_CORRECTION" }>; groupages: number; monoCohort: number; multiCohort: number };
export type BilanPayload = {
  meta: { cohort: string; cohortId: string; cohortYear: number; cohortMonth: number; period: { from: string; to: string } | null; calculatedAt: string; status: BilanStatus; sources: string[] };
  activity: Record<"FIH" | "LSHI" | "KLZ", { occurrences: number; uniqueIdentities: number; cohortWeightKg: number }> & { totalCohortWeightKg: number; periodRegisteredWeightKg: number | null; cohortPeriodDifferenceKg: number | null };
  shipment: { registeredCohortWeightKg: number; certifiedShippedWeightKg: number; remainingWeightKg: number; status: BilanStatus; anomalies: ShipmentAgencyAnomaly[]; byAgency: Record<"FIH" | "LSHI" | "KLZ", ShipmentAgencyMetrics> };
  payments: { receivedAmount: number; recordedExpectedAmount: number; historicalRevenueStatus: string; paymentCount: number; partialPayments: number; completePayments: number; unmatchedPayments: number; collectionRate: number | null; remainingAmount: number | null };
  directCosts: { declarantLshiUsd: number; declarantLshiDhlUsd: number; declarantFihStandardUsd: number; declarantFihDhlUsd: number; transitFihLshiUsd: number; expeditionKlzUsd: number; otherCertifiedUsd: number; totalAllocatedUsd: number; totalUnallocatedUsd: number; unallocated: unknown[] };
  fixedCosts: { basis: "BILAN_ANALYSIS_MONTH"; byAgency: Record<"COO" | "FIH" | "LSHI" | "KLZ", number>; totalUsd: number; definitions: Record<"COO" | "FIH" | "LSHI" | "KLZ", { amountUsd: number; components: readonly string[] }> };
  monthlyBonuses: { monthOrigin: string; status: "A_DEFINIR" | "PARTIELLEMENT_CERTIFIE" | "CERTIFIE"; byAgency: Record<"COO" | "FIH" | "LSHI" | "KLZ", number>; totalUsd: number; rows: Array<{ id: string; agentId: string; agentName: string; agency: "COO" | "FIH" | "LSHI" | "KLZ"; amountUsd: number | null; status: "A_DEFINIR" | "CERTIFIEE" | "PAYEE" }> };
  transit: { shipments: number; officialWeightKg: number; rateUsdPerKg: number; amountUsd: number; status: BilanStatus; additionalFihProofRequired: boolean };
  periodExpenses: { byCategoryAndCurrency: Record<string, CurrencyTotals>; byCurrency: CurrencyTotals; deductibleByCategoryAndCurrency: Record<string, CurrencyTotals>; deductibleByCurrency: CurrencyTotals; deductibleByAgencyAndCurrency: Record<string, CurrencyTotals>; deductibleConnectionByAgencyAndCurrency: Record<string, CurrencyTotals>; deductibleUnallocatedByCurrency: CurrencyTotals; excludedFromProfitByCategoryAndCurrency: Record<string, CurrencyTotals> } | null;
  treasury: { tfBeninByCurrency: CurrencyTotals; remainingToTransfer: null } | null;
  results: { realRevenue: { status: "CERTIFIE"; basis: "REGISTERED_COHORT_WEIGHT"; ratesUsdPerKg: Record<"FIH" | "LSHI" | "KLZ", number>; byAgency: Record<"FIH" | "LSHI" | "KLZ", number>; totalUsd: number }; theoreticalReceivableUsd: number; realProfit: { status: "CERTIFIE" | "PROVISOIRE"; amountUsd: number; basis: "CERTIFIED_REVENUE_MINUS_NON_DUPLICATED_COSTS" }; agencyProfits: { byAgency: Record<"FIH" | "LSHI" | "KLZ", { revenueUsd: number; directCostsUsd: number; fixedCostsUsd: number; operationalExpensesUsd: number; amountUsd: number; status: "CERTIFIE" | "PROVISOIRE" }>; centralCoo: { revenueUsd: 0; fixedCostsUsd: number; operationalExpensesUsd: number; totalCostsUsd: number }; consolidated: { amountUsd: number; status: "CERTIFIE" | "PROVISOIRE" }; reconciliationDifferenceUsd: number }; profitAfterBonuses: { status: "CERTIFIE" | "PROVISOIRE"; byAgency: Record<"FIH" | "LSHI" | "KLZ", { beforeBonusUsd: number; bonusUsd: number; afterBonusUsd: number }>; centralCooBonusUsd: number; beforeBonusUsd: number; totalBonusUsd: number; afterBonusUsd: number; reconciliationDifferenceUsd: number }; RESULTAT_OPERATIONNEL_PERIODE_USD: number | null; directMargin: { status: BilanStatus; amountUsd: number | null; label: string } };
  dataQuality: Array<{ type: string; source: string; reference?: string | null; agency?: string | null; cohortId?: string | null; impact: string }>;
};

export type UnresolvedCohort = { code: "COHORTE_NON_RESOLUE"; requested: string; meta: { status: "NON_CALCULABLE" } };

export function buildBilanQuery(cohort: string, period: { from: string; to: string } | null) {
  const params = new URLSearchParams({ cohort });
  if (period) { params.set("startDate", period.from); params.set("endDate", period.to); }
  return params.toString();
}

export function monthPeriod(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export function formatBilanStatus(status: BilanStatus) {
  return status === "CERTIFIE" || status === "CERTIFIED" ? "CERTIFIÉ" : status === "A_DEFINIR" ? "À DÉFINIR" : status === "PARTIELLEMENT_CERTIFIE" ? "PARTIELLEMENT CERTIFIÉ" : status === "PARTIAL" ? "DONNÉES PARTIELLES" : status === "NOT_CALCULABLE" || status === "NON_CALCULABLE" ? "NON CALCULABLE" : status;
}
