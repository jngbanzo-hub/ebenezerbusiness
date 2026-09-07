import type { BilanAgency, CohortId, DirectCostKind } from "./bilan-contracts";

export type CalculationStatus = "CERTIFIÉ" | "PROVISOIRE" | "NON IMPUTÉ" | "NON CALCULABLE";

export type AggregatedQualityIssue = Readonly<{
  type: string;
  source: string;
  reference: string;
  agency: string | null;
  cohortId: CohortId | null;
  impact: string;
}>;

export type AgencyCohortActivity = Readonly<{
  agency: BilanAgency;
  occurrences: number;
  certifiedUniqueIdentities: number;
  registeredWeightKg: number;
  cohortWeightKg: number;
}>;

export type CohortActivity = Readonly<{
  cohortId: CohortId;
  period: Readonly<{ from: string; to: string }> | null;
  agencies: Readonly<Record<BilanAgency, AgencyCohortActivity>>;
  periodWeightKg: number | null;
  cohortWeightKg: number;
  scopeDifferenceKg: number | null;
  anomalies: readonly AggregatedQualityIssue[];
}>;

export type CohortShipmentSummary = Readonly<{
  cohortId: CohortId;
  registeredWeightKg: number;
  certifiedShippedWeightKg: number;
  remainingWeightKg: number;
  anomalies: readonly AggregatedQualityIssue[];
}>;

export type CohortPaymentsSummary = Readonly<{
  cohortId: CohortId;
  receivedAmount: number;
  recordedExpectedAmount: number;
  historicalRevenueStatus: "NON CERTIFIÉ";
  simulatedCurrentRateRevenue: null;
  paymentCount: number;
  partialPayments: number;
  completePayments: number;
  unmatchedPayments: number;
  collectionRate: number | null;
  anomalies: readonly AggregatedQualityIssue[];
}>;

export type CohortDirectCost = Readonly<{
  kind: DirectCostKind;
  cohortId: CohortId | null;
  amountCents: number;
  status: "CERTIFIÉ" | "NON IMPUTÉ";
  sourceReference: string;
}>;

export type PeriodExpenseSummary = Readonly<{
  period: Readonly<{ from: string; to: string }>;
  operationalByCurrency: Readonly<Record<string, number>>;
  operationalByCategoryAndCurrency: Readonly<Record<string, Readonly<Record<string, number>>>>;
  deductibleOperationalByCurrency: Readonly<Record<string, number>>;
  deductibleOperationalByCategoryAndCurrency: Readonly<Record<string, Readonly<Record<string, number>>>>;
  deductibleOperationalByAgencyAndCurrency: Readonly<Record<string, Readonly<Record<string, number>>>>;
  deductibleOperationalUnallocatedByCurrency: Readonly<Record<string, number>>;
  excludedFromProfitByCategoryAndCurrency: Readonly<Record<string, Readonly<Record<string, number>>>>;
  tfBeninByCurrency: Readonly<Record<string, number>>;
  directCostsAllocated: readonly CohortDirectCost[];
  directCostsUnallocated: readonly CohortDirectCost[];
  anomalies: readonly AggregatedQualityIssue[];
}>;

export type DirectMargin = Readonly<{
  status: CalculationStatus;
  amountUsd: number | null;
  label: string;
}>;
