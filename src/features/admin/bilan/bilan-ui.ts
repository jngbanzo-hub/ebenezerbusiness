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
  transit: { shipments: number; officialWeightKg: number; rateUsdPerKg: number; amountUsd: number; status: BilanStatus; additionalFihProofRequired: boolean };
  periodExpenses: { byCategoryAndCurrency: Record<string, CurrencyTotals>; byCurrency: CurrencyTotals } | null;
  treasury: { tfBeninByCurrency: CurrencyTotals; remainingToTransfer: null } | null;
  results: { RESULTAT_OPERATIONNEL_PERIODE_USD: number | null; directMargin: { status: BilanStatus; amountUsd: number | null; label: string } };
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
  return status === "CERTIFIE" || status === "CERTIFIED" ? "CERTIFIÉ" : status === "PARTIAL" ? "DONNÉES PARTIELLES" : status === "NOT_CALCULABLE" || status === "NON_CALCULABLE" ? "NON CALCULABLE" : status;
}
