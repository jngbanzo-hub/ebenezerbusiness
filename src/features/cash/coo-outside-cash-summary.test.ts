import assert from "node:assert/strict";
import test from "node:test";

import { buildCooOutsideCashSummary } from "./coo-outside-cash-summary";

test("aligne les recettes COO du jour sans créer de caisse", () => {
  const summary = buildCooOutsideCashSummary("2026-08-12", [
    { agenceEncaissement: "COO", dateKey: "2026-08-12", montantPaye: 9, agent: "Kiss" },
    { agenceEncaissement: "COO", dateKey: "2026-08-11", montantPaye: 4, agent: "Kiss" },
    { agenceEncaissement: "FIH", dateKey: "2026-08-12", montantPaye: 12, agent: "Sera" }
  ], []);
  assert.equal(summary.paymentCount, 1);
  assert.equal(summary.paymentsTotal, 9);
  assert.equal(summary.byAgent[0]?.actorName, "Kiss");
});

test("retourne zéro sans encaissement COO", () => {
  const summary = buildCooOutsideCashSummary("2026-08-12", [], []);
  assert.equal(summary.paymentCount, 0);
  assert.equal(summary.paymentsTotal, 0);
});
