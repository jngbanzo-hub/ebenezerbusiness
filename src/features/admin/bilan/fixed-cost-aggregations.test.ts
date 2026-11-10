import assert from "node:assert/strict";
import test from "./bilan-test-context";

import type { BilanExpense } from "./bilan-readers-contracts";
import { aggregatePeriodExpenses } from "./expense-aggregations";
import { calculateMonthlyFixedCosts, isFixedCostExpenseCategory } from "./fixed-cost-aggregations";
import { calculateAgencyProfits, calculateRealProfit } from "./revenue-aggregations";

test("charges fixes mensuelles PDG par agence et total", () => {
  const result = calculateMonthlyFixedCosts("2026-10");
  assert.deepEqual(result.byAgency, { COO: 770, FIH: 540, LSHI: 950, KLZ: 130 });
  assert.equal(result.totalUsd, 2390);
  assert.equal(result.basis, "BILAN_ANALYSIS_MONTH");
  assert.deepEqual(result.definitions.KLZ.components, ["Salaire"]);
});

test("loyer KLZ de 100 USD mensuels uniquement à partir de novembre 2026", () => {
  for (const month of ["2026-11", "2026-12", "2027-01", "2028-11"]) {
    const result = calculateMonthlyFixedCosts(month);
    assert.deepEqual(result.byAgency, { COO: 770, FIH: 540, LSHI: 950, KLZ: 230 });
    assert.equal(result.totalUsd, 2490);
    assert.deepEqual(result.definitions.KLZ.components, ["Salaire", "Loyer"]);
  }
  assert.equal(calculateMonthlyFixedCosts("2026-09").byAgency.KLZ, 130);
  assert.throws(() => calculateMonthlyFixedCosts("2026-13"));
});

test("périodes personnalisées du même mois gardent une seule charge fixe, sans prorata", () => {
  for (const period of [
    { from: "2026-10-01", to: "2026-10-15", month: "2026-10", expected: 130 },
    { from: "2026-11-01", to: "2026-11-01", month: "2026-11", expected: 230 },
    { from: "2026-11-12", to: "2026-11-20", month: "2026-11", expected: 230 },
    { from: "2026-12-05", to: "2026-12-31", month: "2026-12", expected: 230 }
  ]) {
    assert.equal(period.from.slice(0, 7), period.month);
    assert.equal(period.to.slice(0, 7), period.month);
    assert.equal(calculateMonthlyFixedCosts(period.month).byAgency.KLZ, period.expected);
  }
});

test("les 70 USD du loyer d'octobre payés en novembre restent déductibles ; un futur Loyer KLZ explicite ne l'est pas deux fois", () => {
  const octoberRentPaidInNovember: BilanExpense = {
    date: "2026-11-07", agency: "KLZ", category: "Autres", amount: 70, currency: "USD",
    description: "LOYER KLZ", reference: "", status: "ACTIVE", cancelled: false, corrected: false,
    sourceReference: "historical-october-rent"
  };
  const november = aggregatePeriodExpenses([octoberRentPaidInNovember], { from: "2026-11-01", to: "2026-11-30" });
  assert.equal(november.operationalByCurrency.USD, 70);
  assert.equal(november.deductibleOperationalByCurrency.USD, 70);
  assert.equal(november.deductibleExpenseLines[0].sourceReference, "historical-october-rent");
  const before = calculateRealProfit(10000, 1000, calculateMonthlyFixedCosts("2026-10").totalUsd, 70, false);
  const after = calculateRealProfit(10000, 1000, calculateMonthlyFixedCosts("2026-11").totalUsd, november.deductibleOperationalByCurrency.USD, false);
  assert.equal(after.amountUsd, before.amountUsd - 100);

  const december = aggregatePeriodExpenses([
    { ...octoberRentPaidInNovember, date: "2026-12-05", category: "Loyer", amount: 100, sourceReference: "future-klz-rent" }
  ], { from: "2026-12-01", to: "2026-12-31" });
  assert.equal(december.operationalByCurrency.USD, 100);
  assert.equal(december.deductibleOperationalByCurrency.USD, undefined);
  assert.deepEqual(december.excludedFromProfitByCategoryAndCurrency.Loyer, { USD: 100 });
});

test("le loyer KLZ réduit de 100 USD le bénéfice KLZ et EEB, sans toucher FIH, LSHI ni COO", () => {
  const calculate = (month: string) => {
    const fixed = calculateMonthlyFixedCosts(month);
    return calculateAgencyProfits({
      revenueByAgency: { FIH: 1000, LSHI: 2000, KLZ: 3000 },
      directCostsByAgency: { FIH: 100, LSHI: 200, KLZ: 300 },
      fixedCostsByAgency: { FIH: fixed.byAgency.FIH, LSHI: fixed.byAgency.LSHI, KLZ: fixed.byAgency.KLZ },
      operationalExpensesByAgency: { FIH: 10, LSHI: 20, KLZ: 70 },
      centralCooFixedCostUsd: fixed.byAgency.COO,
      centralCooOperationalExpensesUsd: 50,
      unallocatedCostsByAgency: { FIH: 0, LSHI: 0, KLZ: 0 },
      unallocatedCostsUsd: 0
    });
  };
  const october = calculate("2026-10");
  for (const month of ["2026-11", "2026-12", "2027-01"]) {
    const later = calculate(month);
    assert.deepEqual(later.byAgency.FIH, october.byAgency.FIH);
    assert.deepEqual(later.byAgency.LSHI, october.byAgency.LSHI);
    assert.deepEqual(later.centralCoo, october.centralCoo);
    assert.equal(later.byAgency.KLZ.amountUsd, october.byAgency.KLZ.amountUsd - 100);
    assert.equal(later.consolidated.amountUsd, october.consolidated.amountUsd - 100);
    assert.equal(later.reconciliationDifferenceUsd, 0);
  }
});

test("les catégories fixes sont reconnues selon la matrice certifiée de chaque agence", () => {
  for (const agency of ["COO", "FIH", "LSHI", "KLZ"]) assert.equal(isFixedCostExpenseCategory("Salaire", agency), true, agency);
  for (const category of ["Loyer", "Connexion"]) assert.equal(isFixedCostExpenseCategory(category, "COO"), true, category);
  for (const category of ["Loyer", "Eau", "Électricité", "Eau et Électricité", "Chauffeur"]) assert.equal(isFixedCostExpenseCategory(category, "LSHI"), true, category);
  for (const agency of ["FIH", "LSHI", "KLZ"]) assert.equal(isFixedCostExpenseCategory("Connexion", agency), false, agency);
  assert.equal(isFixedCostExpenseCategory("Loyer", "KLZ"), false);
  assert.equal(isFixedCostExpenseCategory("Loyer", "KLZ", "2026-10"), false);
  assert.equal(isFixedCostExpenseCategory("Loyer", "KLZ", "2026-11"), true);
  assert.equal(isFixedCostExpenseCategory("Loyer", "COO", "2026-11"), true);
  assert.equal(isFixedCostExpenseCategory("Loyer", "LSHI", "2026-11"), true);
  assert.equal(isFixedCostExpenseCategory("Loyer", "FIH", "2026-11"), false);
  for (const category of ["Déclarant", "Sacs", "Crédit", "TF Bénin", "Autre dépense ponctuelle"]) assert.equal(isFixedCostExpenseCategory(category, "LSHI"), false, category);
});
