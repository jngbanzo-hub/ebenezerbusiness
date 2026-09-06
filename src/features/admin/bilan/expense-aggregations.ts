import type { CohortId } from "./bilan-contracts";
import type { AggregatedQualityIssue, CohortDirectCost, DirectMargin, PeriodExpenseSummary } from "./bilan-aggregation-contracts";
import type { BilanExpense } from "./bilan-readers-contracts";

export function aggregatePeriodExpenses(
  expenses: readonly BilanExpense[],
  period: Readonly<{ from: string; to: string }>,
  certifiedCohortLinks: Readonly<Record<string, CohortId>> = {}
): PeriodExpenseSummary {
  const operationalByCurrency: Record<string, number> = {};
  const operationalByCategoryAndCurrency: Record<string, Record<string, number>> = {};
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
    if (expense.category === "Expédition KLZ") {
      const cohortId = certifiedCohortLinks[expense.sourceReference] ?? null;
      const cost = Object.freeze({ kind: "EXPEDITION_KLZ" as const, cohortId, amountCents: Math.round(expense.amount * 100), status: cohortId ? "CERTIFIÉ" as const : "NON IMPUTÉ" as const, sourceReference: expense.sourceReference });
      if (cohortId) directCostsAllocated.push(cost);
      else directCostsUnallocated.push(cost);
      if (!cohortId) anomalies.push(issue("CHARGE_DIRECTE_NON_IMPUTEE", "DÉPENSES", expense.sourceReference, expense.agency, null, "Charge exclue de la marge certifiée jusqu’au rattachement de cohorte."));
      continue;
    }
    add(operationalByCurrency, expense.currency, expense.amount);
    operationalByCategoryAndCurrency[expense.category] ??= {};
    add(operationalByCategoryAndCurrency[expense.category], expense.currency, expense.amount);
  }
  return Object.freeze({ period, operationalByCurrency: freezeRecord(operationalByCurrency), operationalByCategoryAndCurrency: Object.freeze(Object.fromEntries(Object.entries(operationalByCategoryAndCurrency).map(([key, value]) => [key, freezeRecord(value)]))), tfBeninByCurrency: freezeRecord(tfBeninByCurrency), directCostsAllocated: Object.freeze(directCostsAllocated), directCostsUnallocated: Object.freeze(directCostsUnallocated), anomalies: Object.freeze(anomalies) });
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
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function issue(type: string, source: string, reference: string, agency: string | null, cohortId: CohortId | null, impact: string): AggregatedQualityIssue { return Object.freeze({ type, source, reference, agency, cohortId, impact }); }
