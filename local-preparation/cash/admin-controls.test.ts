import assert from "node:assert/strict";
import test from "node:test";

import { adminChangeToCashEvent, buildAdminCashOverview, canReadCash, closeCashDay, createAdminCashChange, detectCashAnomalies, reopenCashDay } from "./admin-controls";
import { buildDailyCashProjection } from "./cash-projection";
import { cashEvent } from "./fixtures";

const admin = { userId: "admin-1", name: "Admin Principal", role: "ADMIN" as const };
const openProjection = (agency: "FIH" | "LSHI" | "KLZ") => buildDailyCashProjection({ agency, businessDate: "2026-07-31", yesterdayBalance: 100, events: [cashEvent({ agency, amount: 50 })] });

test("Admin consulte exactement FIH, LSHI et KLZ avec total consolidé", () => {
  const overview = buildAdminCashOverview([openProjection("KLZ"), openProjection("FIH"), openProjection("LSHI")], 75);
  assert.deepEqual(overview.cashes.map((cash) => cash.agency), ["FIH", "LSHI", "KLZ"]);
  assert.equal(overview.consolidatedCashBalance, 450);
  assert.equal(overview.cooRevenueOutsideCash, 75);
  assert.equal(overview.cashes.some((cash) => (cash.agency as string) === "COO"), false);
});

test("refuse une vue Admin incomplète ou contenant des doublons", () => {
  assert.throws(() => buildAdminCashOverview([openProjection("FIH"), openProjection("FIH"), openProjection("LSHI")], 0), /INCOMPLETE_ADMIN_CASH_SCOPE/);
});

test("valide un solde initial avec identité, motif, heure et audit", () => {
  const change = createAdminCashChange({ changeId: "change-1", auditId: "audit-1", kind: "INITIAL_BALANCE_VALIDATED", agency: "FIH", targetId: "opening-fih", previousValue: null, newValue: 500, reason: "Solde initial contrôlé", admin, occurredAt: "2026-07-31T08:00:00.000Z" });
  assert.deepEqual({ previousValue: change.previousValue, newValue: change.newValue, reason: change.reason, admin: change.adminUserId, audit: change.auditId }, { previousValue: null, newValue: 500, reason: "Solde initial contrôlé", admin: "admin-1", audit: "audit-1" });
});

test("ajoute un ajustement Admin sans remplacer un événement", () => {
  const change = createAdminCashChange({ changeId: "adjust-1", auditId: "audit-2", kind: "ADMIN_ADJUSTMENT_ADDED", agency: "LSHI", targetId: "cash-lshi", previousValue: 100, newValue: 125, reason: "Écart physique validé", admin, occurredAt: "2026-07-31T12:00:00.000Z" });
  const event = adminChangeToCashEvent(change, { eventId: "event-adjust-1", requestId: "request-adjust-1", businessDate: "2026-07-31" });
  assert.equal(event.eventType, "ADMIN_ADJUSTMENT_RECORDED");
  assert.equal(event.direction, "CREDIT");
  assert.equal(event.amount, 25);
  assert.equal(event.correctsEventId, null);
});

test("correction conserve ancienne et nouvelle valeur et cible l'original", () => {
  const change = createAdminCashChange({ changeId: "correction-1", auditId: "audit-3", kind: "ERROR_CORRECTED", agency: "KLZ", targetId: "payment-incorrect", previousValue: 80, newValue: 60, reason: "Montant saisi incorrectement", admin, occurredAt: "2026-07-31T13:00:00.000Z" });
  const event = adminChangeToCashEvent(change, { eventId: "event-correction-1", requestId: "request-correction-1", businessDate: "2026-07-31" });
  assert.equal(event.direction, "DEBIT");
  assert.equal(event.amount, 20);
  assert.equal(event.correctsEventId, "payment-incorrect");
  assert.deepEqual(event.metadata, { auditId: "audit-3", previousValue: 80, newValue: 60 });
});

test("refuse toute correction sans motif", () => {
  assert.throws(() => createAdminCashChange({ changeId: "c", auditId: "a", kind: "ERROR_CORRECTED", agency: "FIH", targetId: "target", previousValue: 10, newValue: 20, reason: "", admin, occurredAt: "2026-07-31T13:00:00.000Z" }), /INVALID_REASON/);
});

test("clôture une journée ouverte avec trace Admin", () => {
  const decision = closeCashDay(openProjection("FIH"), admin, { decisionId: "close-1", auditId: "audit-close-1", occurredAt: "2026-07-31T23:00:00.000Z" });
  assert.deepEqual({ action: decision.action, previous: decision.previousStatus, next: decision.newStatus, balance: decision.balance }, { action: "CLOSED", previous: "OPEN", next: "CLOSED", balance: 150 });
});

test("réouvre uniquement une journée clôturée avec motif", () => {
  const closed = buildDailyCashProjection({ agency: "FIH", businessDate: "2026-07-31", yesterdayBalance: 100, events: [cashEvent({ agency: "FIH", amount: 50 })], closure: { closureId: "close-1", agency: "FIH", businessDate: "2026-07-31", closedAt: "2026-07-31T22:00:00.000Z", closedByAdminId: "admin-1", balance: 150 } });
  const decision = reopenCashDay(closed, admin, { decisionId: "reopen-1", auditId: "audit-reopen-1", occurredAt: "2026-08-01T08:00:00.000Z", reason: "Écart à investiguer" });
  assert.equal(decision.newStatus, "OPEN");
  assert.equal(decision.reason, "Écart à investiguer");
  assert.throws(() => reopenCashDay(closed, admin, { decisionId: "r", auditId: "a", occurredAt: "2026-08-01T08:00:00.000Z", reason: "" }), /INVALID_REOPEN_REASON/);
});

test("Agent lit uniquement sa propre caisse et Admin lit les trois", () => {
  assert.equal(canReadCash({ role: "AGENT", agency: "LSHI" }, "LSHI"), true);
  assert.equal(canReadCash({ role: "AGENT", agency: "LSHI" }, "FIH"), false);
  assert.equal(canReadCash({ role: "AGENT", agency: "COTONOU" }, "FIH"), false);
  assert.equal(canReadCash({ role: "ADMIN" }, "FIH"), true);
  assert.equal(canReadCash({ role: "ADMIN" }, "COO"), false);
});

test("signale les écarts d'encaissements et dépenses", () => {
  const projection = openProjection("LSHI");
  const anomalies = detectCashAnomalies(projection, { paymentsTotal: 60, expensesTotal: 10 });
  assert.deepEqual(anomalies.map((item) => item.code), ["PAYMENTS_TOTAL_MISMATCH", "EXPENSES_TOTAL_MISMATCH"]);
});

test("les contrôles Admin sont immutables", () => {
  const change = createAdminCashChange({ changeId: "change-immutable", auditId: "audit-immutable", kind: "INITIAL_BALANCE_VALIDATED", agency: "KLZ", targetId: "opening-klz", previousValue: null, newValue: 1, reason: "Validation", admin, occurredAt: "2026-07-31T08:00:00.000Z" });
  assert.equal(Object.isFrozen(change), true);
});
