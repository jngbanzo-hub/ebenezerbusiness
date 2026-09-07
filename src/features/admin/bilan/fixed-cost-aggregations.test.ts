import assert from "node:assert/strict";
import test from "node:test";

import { calculateMonthlyFixedCosts, isFixedCostExpenseCategory } from "./fixed-cost-aggregations";

test("charges fixes mensuelles PDG par agence et total", () => {
  const result = calculateMonthlyFixedCosts();
  assert.deepEqual(result.byAgency, { COO: 770, FIH: 540, LSHI: 950, KLZ: 130 });
  assert.equal(result.totalUsd, 2390);
  assert.equal(result.basis, "BILAN_ANALYSIS_MONTH");
});

test("seules les catégories fixes certifiées sont reconnues", () => {
  for (const category of ["Salaire", "Loyer", "Connexion", "Eau", "Électricité", "Eau et Électricité", "Chauffeur"]) assert.equal(isFixedCostExpenseCategory(category), true, category);
  for (const category of ["Déclarant", "Sacs", "Crédit", "TF Bénin", "Autre dépense ponctuelle"]) assert.equal(isFixedCostExpenseCategory(category), false, category);
});
