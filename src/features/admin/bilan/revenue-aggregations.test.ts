import assert from "node:assert/strict";
import test from "node:test";

import { calculateAgencyProfits, calculateAutomaticKlzShipmentCost, calculateCertifiedCohortRevenue, calculateRealProfit, calculateTheoreticalReceivable } from "./revenue-aggregations";

test("référence PDG AT : le CA utilise tous les kg enregistrés par agence", () => {
  const result = calculateCertifiedCohortRevenue({ FIH: 1525, LSHI: 5514, KLZ: 853 });
  assert.deepEqual(result.byAgency, { FIH: 13725, LSHI: 55140, KLZ: 9383 });
  assert.equal(result.totalUsd, 78248);
  assert.deepEqual(result.ratesUsdPerKg, { FIH: 9, LSHI: 10, KLZ: 11 });
  assert.equal(result.basis, "REGISTERED_COHORT_WEIGHT");
});

test("le bénéfice utilise le CA et les coûts non dupliqués, jamais les encaissements", () => {
  const result = calculateRealProfit(78248, 14565.25, 2390, 7096.26, true);
  assert.equal(result.amountUsd, 54196.49);
  assert.equal(result.status, "PROVISOIRE");
  assert.notEqual(result.amountUsd, 32950 - 14565.25 - 2390 - 7096.26);
});

test("les 298 kg FIH non expédiés restent inclus dans le CA", () => {
  assert.equal(calculateCertifiedCohortRevenue({ FIH: 1525, LSHI: 0, KLZ: 0 }).byAgency.FIH, 13725);
});

test("encaissements et CA restent distincts, puis produisent une créance théorique", () => {
  const revenue = calculateCertifiedCohortRevenue({ FIH: 1525, LSHI: 5514, KLZ: 853 });
  assert.notEqual(revenue.totalUsd, 32950);
  assert.equal(calculateTheoreticalReceivable(revenue.totalUsd, 32950), 45298);
});

test("Expédition KLZ automatique applique 0,60 USD/kg à la cohorte", () => {
  const result = calculateAutomaticKlzShipmentCost(853, "2026-08");
  assert.equal(result.amountCents, 51180);
  assert.equal(result.status, "CERTIFIÉ");
  assert.equal(result.cohortId, "2026-08");
});

test("bénéfices agences moins COO réconcilient le bénéfice EEB après exclusion des 99 USD historiques KLZ", () => {
  const result = calculateAgencyProfits({
    revenueByAgency: { FIH: 13725, LSHI: 55140, KLZ: 9383 },
    directCostsByAgency: { FIH: 3000, LSHI: 11565.25, KLZ: 511.8 },
    fixedCostsByAgency: { FIH: 540, LSHI: 950, KLZ: 130 },
    operationalExpensesByAgency: { FIH: 1000, LSHI: 5000, KLZ: 500 },
    centralCooFixedCostUsd: 770,
    centralCooOperationalExpensesUsd: 596.26,
    unallocatedCostsByAgency: { FIH: 0, LSHI: 0, KLZ: 0 },
    unallocatedCostsUsd: 0
  });
  assert.equal(result.byAgency.FIH.amountUsd, 9185);
  assert.equal(result.byAgency.LSHI.amountUsd, 37624.75);
  assert.equal(result.byAgency.KLZ.amountUsd, 8241.2);
  assert.equal(result.consolidated.amountUsd, 53684.69);
  assert.equal(result.consolidated.status, "CERTIFIE");
  assert.equal(result.byAgency.KLZ.status, "CERTIFIE");
  assert.equal(result.reconciliationDifferenceUsd, 0);
  assert.equal(result.centralCoo.revenueUsd, 0);
});
