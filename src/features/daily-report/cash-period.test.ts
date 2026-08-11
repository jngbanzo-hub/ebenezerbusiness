import assert from "node:assert/strict";
import test from "node:test";
import { resolveCashOpeningBalance } from "./cash-period";

test("reporte les mouvements postérieurs à une ancienne clôture", () => {
  assert.equal(resolveCashOpeningBalance({
    businessDate: "2026-09-01",
    initialBalance: 750,
    previousClosedDay: { businessDate: "2026-07-31", closingBalance: 800 },
    ledger: [
      { eventType: "OPENING_BALANCE_RECORDED", amount: 750, direction: "CREDIT", businessDate: "2026-07-01" },
      { eventType: "PAYMENT_RECORDED", amount: 40, direction: "CREDIT", businessDate: "2026-08-15" },
      { eventType: "EXPENSE_RECORDED", amount: 10, direction: "DEBIT", businessDate: "2026-08-20" }
    ]
  }), 830);
});

test("utilise le solde initial quand aucune clôture antérieure n’existe", () => {
  assert.equal(resolveCashOpeningBalance({
    businessDate: "2027-01-01",
    initialBalance: 100,
    ledger: [
      { eventType: "PAYMENT_RECORDED", amount: 25, direction: "CREDIT", businessDate: "2026-12-31" },
      { eventType: "EXPENSE_RECORDED", amount: 5, direction: "DEBIT", businessDate: "2026-12-31" }
    ]
  }), 120);
});
