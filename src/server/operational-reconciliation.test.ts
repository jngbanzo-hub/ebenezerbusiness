import assert from "node:assert/strict";
import test from "node:test";

import { cashContinuity, orchestrationStage, reconcileOperations } from "./operational-reconciliation";

const now = new Date("2026-09-12T12:00:00Z");
const orchestration = { requestId: "r1", trackingCode: "AT00126", agency: "LSHI" as const, state: "PENDING", paymentCreated: true, cashEventId: null, storageEventId: null, lastError: null, attemptCount: 1, createdAt: "2026-09-12T10:00:00Z", updatedAt: "2026-09-12T10:00:00Z", completedAt: null };

test("les checkpoints exposent chaque étape sans modifier la machine métier", () => {
  assert.equal(orchestrationStage({ ...orchestration, paymentCreated: false }), "PENDING");
  assert.equal(orchestrationStage(orchestration), "PAYMENT_CONFIRMED");
  assert.equal(orchestrationStage({ ...orchestration, cashEventId: "cash" }), "CASH_CONFIRMED");
  assert.equal(orchestrationStage({ ...orchestration, cashEventId: "cash", storageEventId: "stock" }), "STORAGE_CONFIRMED");
  assert.equal(orchestrationStage({ ...orchestration, state: "COMPLETED", cashEventId: "cash", storageEventId: "stock" }), "COMPLETED");
});

test("paiement complet normal: aucun doublon ni anomalie", () => {
  const payment = { requestId: "r1", trackingCode: "AT00126", agency: "LSHI" as const, amountUsd: 30, occurredAt: "2026-09-12T10:00:00Z" };
  const result = reconcileOperations({ payments: [payment], cash: [{ ...payment, eventId: "c1" }], storage: [{ requestId: "r1", eventId: "s1", agency: "LSHI", trackingCode: "AT00126", weightKg: 3, occurredAt: payment.occurredAt }], orchestrations: [{ ...orchestration, state: "COMPLETED", cashEventId: "c1", storageEventId: "s1", completedAt: payment.occurredAt }], closures: [], now });
  assert.equal(result.anomalies.length, 0);
});

test("paiement confirmé incomplet et doubles effets sont détectés sans réparation", () => {
  const payment = { requestId: "r1", trackingCode: "AT00126", agency: "LSHI" as const, amountUsd: 30, occurredAt: "2026-09-12T10:00:00Z" };
  const cash = [{ ...payment, eventId: "c1" }, { ...payment, eventId: "c2" }];
  const result = reconcileOperations({ payments: [payment], cash, storage: [], orchestrations: [orchestration], closures: [], now });
  assert.ok(result.anomalies.some((row) => row.type === "CASH_EVENT_DUPLIQUE"));
  assert.ok(result.anomalies.some((row) => row.type === "PAIEMENT_SANS_SORTIE_STOCKAGE"));
  assert.ok(result.anomalies.some((row) => row.type === "ORCHESTRATION_PENDING_TROP_LONGTEMPS"));
});

test("continuité J-1 vers J exacte et divergente", () => {
  const base = { agency: "FIH" as const, status: "CLOSED", version: 1, occurredAt: "2026-09-12T00:00:00Z" };
  assert.deepEqual(cashContinuity([{ ...base, closureId: "a", businessDate: "2026-09-10", openingBalance: 10, closingBalance: 20 }, { ...base, closureId: "b", businessDate: "2026-09-11", openingBalance: 20, closingBalance: 30 }])[0].difference, 0);
  assert.equal(cashContinuity([{ ...base, closureId: "a", businessDate: "2026-09-10", openingBalance: 10, closingBalance: 20 }, { ...base, closureId: "b", businessDate: "2026-09-11", openingBalance: 19, closingBalance: 30 }])[0].difference, -1);
});

test("une source indisponible ne fabrique jamais une absence métier", () => {
  const payment = { requestId: "r1", trackingCode: "AT00126", agency: "LSHI" as const, amountUsd: 30, occurredAt: "2026-09-12T10:00:00Z" };
  const result = reconcileOperations({ payments: [payment], cash: [], storage: [], orchestrations: [orchestration], closures: [], now, availability: { cash: false, storage: false } });
  assert.equal(result.anomalies.some((row) => row.type === "PAIEMENT_SANS_CASH_EVENT" || row.type === "PAIEMENT_SANS_SORTIE_STOCKAGE"), false);
});
