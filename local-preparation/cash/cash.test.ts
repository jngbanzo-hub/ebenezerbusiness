import assert from "node:assert/strict";
import test from "node:test";

import { CashContractError, classifyCooFinancialActivity, createCashEvent, normalizeCashAgency } from "./cash-contract";
import { buildDailyCashProjection, getCashCapabilities } from "./cash-projection";
import { cashEvent } from "./fixtures";

test("crée une caisse uniquement pour FIH, LSHI et KLZ", () => {
  assert.equal(normalizeCashAgency(" fih "), "FIH");
  assert.equal(normalizeCashAgency("lshi"), "LSHI");
  assert.equal(normalizeCashAgency("KLZ"), "KLZ");
});

test("refuse toute caisse COO ou COTONOU", () => {
  for (const agency of ["COO", "COTONOU"]) {
    assert.throws(() => normalizeCashAgency(agency), (error) => error instanceof CashContractError && error.code === "COO_HAS_NO_CASH");
  }
});

test("classe les paiements et dépenses COO hors caisse", () => {
  assert.equal(classifyCooFinancialActivity("PAYMENT"), "COO_REVENUE_OUTSIDE_CASH");
  assert.equal(classifyCooFinancialActivity("EXPENSE"), "PDG_FUNDED_EXPENSE_OUTSIDE_CASH");
});

test("applique solde hier + encaissements - dépenses = solde actuel", () => {
  const projection = buildDailyCashProjection({
    agency: "LSHI",
    businessDate: "2026-07-31",
    yesterdayBalance: 500,
    events: [
      cashEvent({ amount: 640 }),
      cashEvent({ eventId: "expense-1", eventType: "EXPENSE_DEBIT_RECORDED", direction: "DEBIT", amount: 90, sourceId: "expense-source-1", requestId: "expense-request-1", actorUserId: "agent-b", actorName: "Agent B" }),
    ],
  });
  assert.equal(projection.currentBalance, 1050);
  assert.equal(projection.paymentsTotal, 640);
  assert.equal(projection.expensesTotal, 90);
});

test("agrège plusieurs agents dans une caisse agence unique", () => {
  const projection = buildDailyCashProjection({
    agency: "LSHI",
    businessDate: "2026-07-31",
    yesterdayBalance: 0,
    events: [
      cashEvent({ amount: 640 }),
      cashEvent({ eventId: "p2", sourceId: "s2", requestId: "r2", actorUserId: "agent-b", actorName: "Agent B", amount: 420 }),
      cashEvent({ eventId: "p3", sourceId: "s3", requestId: "r3", actorUserId: "agent-c", actorName: "Agent C", amount: 210 }),
    ],
  });
  assert.equal(projection.paymentCount, 3);
  assert.equal(projection.paymentsTotal, 1270);
  assert.deepEqual(projection.byAgent.map(({ actorName, amountCollected }) => [actorName, amountCollected]), [["Agent A", 640], ["Agent B", 420], ["Agent C", 210]]);
});

test("additionne plusieurs encaissements du même agent", () => {
  const projection = buildDailyCashProjection({ agency: "FIH", businessDate: "2026-07-31", yesterdayBalance: 10, events: [
    cashEvent({ agency: "FIH", amount: 20 }),
    cashEvent({ agency: "FIH", eventId: "p2", sourceId: "s2", requestId: "r2", amount: 30 }),
  ] });
  assert.deepEqual(projection.byAgent[0], { actorUserId: "agent-a", actorName: "Agent A", paymentCount: 2, amountCollected: 50 });
});

test("conserve les corrections comme événements compensatoires audités", () => {
  const correction = cashEvent({ eventId: "correction-1", eventType: "CASH_CORRECTION_RECORDED", direction: "DEBIT", amount: 10, sourceId: "admin-correction-1", requestId: "correction-request-1", actorUserId: "admin-1", actorName: "Admin", correctsEventId: "cash-event-001", reason: "Correction contrôlée" });
  const projection = buildDailyCashProjection({ agency: "LSHI", businessDate: "2026-07-31", yesterdayBalance: 50, events: [cashEvent(), correction] });
  assert.equal(projection.correctionsNet, -10);
  assert.equal(projection.auditEvents.length, 2);
});

test("refuse une correction sans cible et motif", () => {
  assert.throws(() => cashEvent({ eventType: "CASH_CORRECTION_RECORDED", correctsEventId: null, reason: null }), /Champ obligatoire invalide/);
});

test("clôture uniquement avec le solde calculé", () => {
  const projection = buildDailyCashProjection({ agency: "KLZ", businessDate: "2026-07-31", yesterdayBalance: 40, events: [cashEvent({ agency: "KLZ", amount: 60 })], closure: { closureId: "close-1", agency: "KLZ", businessDate: "2026-07-31", closedAt: "2026-07-31T23:00:00.000Z", closedByAdminId: "admin-1", balance: 100 } });
  assert.equal(projection.status, "CLOSED");
  assert.equal(projection.closure?.balance, 100);
});

test("refuse les doublons de source idempotente", () => {
  assert.throws(() => buildDailyCashProjection({ agency: "LSHI", businessDate: "2026-07-31", yesterdayBalance: 0, events: [cashEvent(), cashEvent({ eventId: "other" })] }), /DUPLICATE_REQUEST_ID/);
});

test("refuse toute devise non USD sans conversion automatique", () => {
  assert.throws(() => createCashEvent({ ...cashEvent(), currency: "CDF" }), (error) => error instanceof CashContractError && error.code === "INVALID_CURRENCY");
});

test("agents en lecture seule et Admin en administration complète", () => {
  assert.deepEqual(getCashCapabilities("AGENT", "FIH"), { read: true, open: false, close: false, correct: false });
  assert.deepEqual(getCashCapabilities("ADMIN"), { read: true, open: true, close: true, correct: true });
});

test("retourne des projections profondément immutables", () => {
  const projection = buildDailyCashProjection({ agency: "LSHI", businessDate: "2026-07-31", yesterdayBalance: 0, events: [cashEvent()] });
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.byAgent), true);
  assert.equal(Object.isFrozen(projection.auditEvents[0]), true);
});

test("ne contient aucune dépendance de livraison ou de stock", () => {
  const event = cashEvent();
  assert.equal("parcelStatus" in event, false);
  assert.equal("stockEvent" in event, false);
  assert.equal("delivered" in event, false);
});
