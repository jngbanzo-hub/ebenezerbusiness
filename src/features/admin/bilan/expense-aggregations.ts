import type { CohortId } from "./bilan-contracts";
import type { AggregatedQualityIssue, CohortDirectCost, DirectMargin, PeriodExpenseSummary } from "./bilan-aggregation-contracts";
import type { BilanExpense } from "./bilan-readers-contracts";
import { isFixedCostExpenseCategory } from "./fixed-cost-aggregations";

export function aggregatePeriodExpenses(
  expenses: readonly BilanExpense[],
  period: Readonly<{ from: string; to: string }>
): PeriodExpenseSummary {
  const operationalByCurrency: Record<string, number> = {};
  const operationalByCategoryAndCurrency: Record<string, Record<string, number>> = {};
  const deductibleOperationalByCurrency: Record<string, number> = {};
  const deductibleOperationalByCategoryAndCurrency: Record<string, Record<string, number>> = {};
  const deductibleOperationalByAgencyAndCurrency: Record<string, Record<string, number>> = {};
  const deductibleOperationalUnallocatedByCurrency: Record<string, number> = {};
  const excludedFromProfitByCategoryAndCurrency: Record<string, Record<string, number>> = {};
  const tfBeninByCurrency: Record<string, number> = {};
  const directCostsAllocated: CohortDirectCost[] = [];
  const directCostsUnallocated: CohortDirectCost[] = [];
  const anomalies: AggregatedQualityIssue[] = [];
  for (const expense of expenses) {
    if (expense.date < period.from || expense.date > period.to || expense.cancelled) continue;
    if (!expense.currency) {
      anomalies.push(issue("DEVISE_ABSENTE", "DÉPENSES", expense.sourceReference, expense.agency, null, "Dépense exclue des totaux."));
      continue;
    }
    if (expense.category === "TF Bénin") {
      add(tfBeninByCurrency, expense.currency, expense.amount);
      continue;
    }
    add(operationalByCurrency, expense.currency, expense.amount);
    operationalByCategoryAndCurrency[expense.category] ??= {};
    add(operationalByCategoryAndCurrency[expense.category], expense.currency, expense.amount);
    if (expense.category === "Expédition KLZ") {
      excludedFromProfitByCategoryAndCurrency[expense.category] ??= {};
      add(excludedFromProfitByCategoryAndCurrency[expense.category], expense.currency, expense.amount);
      continue;
    }
    const excludedFromProfit = isDeclarantCategory(expense.category) || isFixedCostExpenseCategory(expense.category);
    const profitTarget = excludedFromProfit ? excludedFromProfitByCategoryAndCurrency : deductibleOperationalByCategoryAndCurrency;
    profitTarget[expense.category] ??= {};
    add(profitTarget[expense.category], expense.currency, expense.amount);
    if (!excludedFromProfit) {
      add(deductibleOperationalByCurrency, expense.currency, expense.amount);
      const agency = expenseAgency(expense.agency);
      if (agency) {
        deductibleOperationalByAgencyAndCurrency[agency] ??= {};
        add(deductibleOperationalByAgencyAndCurrency[agency], expense.currency, expense.amount);
      } else add(deductibleOperationalUnallocatedByCurrency, expense.currency, expense.amount);
    }
  }
  return Object.freeze({ period, operationalByCurrency: freezeRecord(operationalByCurrency), operationalByCategoryAndCurrency: freezeNested(operationalByCategoryAndCurrency), deductibleOperationalByCurrency: freezeRecord(deductibleOperationalByCurrency), deductibleOperationalByCategoryAndCurrency: freezeNested(deductibleOperationalByCategoryAndCurrency), deductibleOperationalByAgencyAndCurrency: freezeNested(deductibleOperationalByAgencyAndCurrency), deductibleOperationalUnallocatedByCurrency: freezeRecord(deductibleOperationalUnallocatedByCurrency), excludedFromProfitByCategoryAndCurrency: freezeNested(excludedFromProfitByCategoryAndCurrency), tfBeninByCurrency: freezeRecord(tfBeninByCurrency), directCostsAllocated: Object.freeze(directCostsAllocated), directCostsUnallocated: Object.freeze(directCostsUnallocated), anomalies: Object.freeze(anomalies) });
}

export function resultOperationalPeriodUsd(receivedUsd: number, expenses: PeriodExpenseSummary) {
  return money(receivedUsd - (expenses.operationalByCurrency.USD ?? 0));
}

export function calculateDirectMargin(input: Readonly<{
  historicalRevenueUsd: number | null;
  certifiedDirectCostsUsd: number;
  hasUnallocatedDirectCosts: boolean;
}>): DirectMargin {
  if (input.historicalRevenueUsd === null) return Object.freeze({ status: "NON CALCULABLE", amountUsd: null, label: "CA historique non certifié" });
  const amountUsd = money(input.historicalRevenueUsd - input.certifiedDirectCostsUsd);
  if (input.hasUnallocatedDirectCosts) return Object.freeze({ status: "PROVISOIRE", amountUsd, label: "MARGE PROVISOIRE — PÉRIMÈTRE CERTIFIÉ" });
  return Object.freeze({ status: "CERTIFIÉ", amountUsd, label: "MARGE DIRECTE CERTIFIÉE" });
}

export function sumDirectCostsForCohort(costs: readonly CohortDirectCost[], cohortId: CohortId) {
  return money(costs.filter((cost) => cost.status === "CERTIFIÉ" && cost.cohortId === cohortId).reduce((total, cost) => total + cost.amountCents / 100, 0));
}

function add(target: Record<string, number>, key: string, value: number) { target[key] = money((target[key] ?? 0) + value); }
function freezeRecord(value: Record<string, number>) { return Object.freeze({ ...value }); }
function freezeNested(value: Record<string, Record<string, number>>) { return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, totals]) => [key, freezeRecord(totals)]))); }
function isDeclarantCategory(value: string) { return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")==="declarant"; }
function expenseAgency(value: string) { const agency = value.trim().toUpperCase(); return agency === "FIH" || agency === "LSHI" || agency === "KLZ" || agency === "COO" ? agency : null; }
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function issue(type: string, source: string, reference: string, agency: string | null, cohortId: CohortId | null, impact: string): AggregatedQualityIssue { return Object.freeze({ type, source, reference, agency, cohortId, impact }); }
