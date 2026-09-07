import assert from "node:assert/strict";
import test from "node:test";

import { calculateMonthlyFixedCosts, isFixedCostExpenseCategory } from "./fixed-cost-aggregations";

test("charges fixes mensuelles PDG par agence et total", () => {
  const result = calculateMonthlyFixedCosts();
  assert.deepEqual(result.byAgency, { COO: 770, FIH: 540, LSHI: 950, KLZ: 130 });
  assert.equal(result.totalUsd, 2390);
  assert.equal(result.basis, "BILAN_ANALYSIS_MONTH");
});

test("les catégories fixes sont reconnues selon la matrice certifiée de chaque agence", () => {
  for (const agency of ["COO", "FIH", "LSHI", "KLZ"]) assert.equal(isFixedCostExpenseCategory("Salaire", agency), true, agency);
  for (const category of ["Loyer", "Connexion"]) assert.equal(isFixedCostExpenseCategory(category, "COO"), true, category);
  for (const category of ["Loyer", "Eau", "Électricité", "Eau et Électricité", "Chauffeur"]) assert.equal(isFixedCostExpenseCategory(category, "LSHI"), true, category);
  for (const agency of ["FIH", "LSHI", "KLZ"]) assert.equal(isFixedCostExpenseCategory("Connexion", agency), false, agency);
  assert.equal(isFixedCostExpenseCategory("Loyer", "KLZ"), false);
  for (const category of ["Déclarant", "Sacs", "Crédit", "TF Bénin", "Autre dépense ponctuelle"]) assert.equal(isFixedCostExpenseCategory(category, "LSHI"), false, category);
});
