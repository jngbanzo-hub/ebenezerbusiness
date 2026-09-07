import type { BilanAgency } from "./bilan-contracts";
import type { CohortDirectCost } from "./bilan-aggregation-contracts";
import type { CohortId } from "./bilan-contracts";

export const BILAN_REVENUE_RATES_USD_PER_KG: Readonly<Record<BilanAgency, number>> = Object.freeze({
  FIH: 9,
  LSHI: 10,
  KLZ: 11
});

export function calculateCertifiedCohortRevenue(weightsKg: Readonly<Record<BilanAgency, number>>) {
  const byAgency = Object.freeze(Object.fromEntries(
    (Object.keys(BILAN_REVENUE_RATES_USD_PER_KG) as BilanAgency[]).map((agency) => [agency, money(weightsKg[agency] * BILAN_REVENUE_RATES_USD_PER_KG[agency])])
  ) as Record<BilanAgency, number>);
  return Object.freeze({
    status: "CERTIFIE" as const,
    basis: "REGISTERED_COHORT_WEIGHT" as const,
    ratesUsdPerKg: BILAN_REVENUE_RATES_USD_PER_KG,
    byAgency,
    totalUsd: money(Object.values(byAgency).reduce((total, amount) => total + amount, 0))
  });
}

export function calculateTheoreticalReceivable(revenueUsd: number, cohortReceiptsUsd: number) {
  return money(revenueUsd - cohortReceiptsUsd);
}

export function calculateAutomaticKlzShipmentCost(weightKg: number, cohortId: CohortId): CohortDirectCost {
  return Object.freeze({ kind: "EXPEDITION_KLZ", cohortId, amountCents: Math.round(weightKg * 60), status: "CERTIFIÉ", sourceReference: `BILAN:${cohortId}:KLZ_WEIGHT` });
}

export function calculateAgencyProfits(input: Readonly<{
  revenueByAgency: Readonly<Record<BilanAgency, number>>;
  directCostsByAgency: Readonly<Record<BilanAgency, number>>;
  fixedCostsByAgency: Readonly<Record<BilanAgency, number>>;
  operationalExpensesByAgency: Readonly<Record<BilanAgency, number>>;
  centralCooFixedCostUsd: number;
  centralCooOperationalExpensesUsd: number;
  unallocatedCostsByAgency: Readonly<Record<BilanAgency, number>>;
  unallocatedCostsUsd: number;
}>) {
  const byAgency = Object.freeze(Object.fromEntries((["FIH", "LSHI", "KLZ"] as const).map((agency) => {
    const amountUsd = money(input.revenueByAgency[agency] - input.directCostsByAgency[agency] - input.fixedCostsByAgency[agency] - input.operationalExpensesByAgency[agency]);
    return [agency, Object.freeze({ revenueUsd: input.revenueByAgency[agency], directCostsUsd: input.directCostsByAgency[agency], fixedCostsUsd: input.fixedCostsByAgency[agency], operationalExpensesUsd: input.operationalExpensesByAgency[agency], amountUsd, status: input.unallocatedCostsByAgency[agency] > 0 ? "PROVISOIRE" as const : "CERTIFIE" as const })];
  })) as Record<BilanAgency, { revenueUsd: number; directCostsUsd: number; fixedCostsUsd: number; operationalExpensesUsd: number; amountUsd: number; status: "CERTIFIE" | "PROVISOIRE" }>);
  const centralCooCostsUsd = money(input.centralCooFixedCostUsd + input.centralCooOperationalExpensesUsd);
  const consolidatedAmountUsd = money(Object.values(byAgency).reduce((total, item) => total + item.amountUsd, 0) - centralCooCostsUsd);
  const globalAmountUsd = money(
    Object.values(input.revenueByAgency).reduce((total, amount) => total + amount, 0)
    - Object.values(input.directCostsByAgency).reduce((total, amount) => total + amount, 0)
    - Object.values(input.fixedCostsByAgency).reduce((total, amount) => total + amount, 0)
    - Object.values(input.operationalExpensesByAgency).reduce((total, amount) => total + amount, 0)
    - centralCooCostsUsd
  );
  return Object.freeze({ byAgency, centralCoo: Object.freeze({ revenueUsd: 0, fixedCostsUsd: input.centralCooFixedCostUsd, operationalExpensesUsd: input.centralCooOperationalExpensesUsd, totalCostsUsd: centralCooCostsUsd }), consolidated: Object.freeze({ amountUsd: consolidatedAmountUsd, status: input.unallocatedCostsUsd > 0 ? "PROVISOIRE" as const : "CERTIFIE" as const }), reconciliationDifferenceUsd: money(consolidatedAmountUsd - globalAmountUsd) });
}

export function calculateRealProfit(revenueUsd: number, automaticDirectCostsUsd: number, monthlyFixedCostsUsd: number, deductibleOperationalExpensesUsd: number, hasUnallocatedDirectCosts: boolean) {
  return Object.freeze({
    status: hasUnallocatedDirectCosts ? "PROVISOIRE" as const : "CERTIFIE" as const,
    amountUsd: money(revenueUsd - automaticDirectCostsUsd - monthlyFixedCostsUsd - deductibleOperationalExpensesUsd),
    basis: "CERTIFIED_REVENUE_MINUS_NON_DUPLICATED_COSTS" as const
  });
}

function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
