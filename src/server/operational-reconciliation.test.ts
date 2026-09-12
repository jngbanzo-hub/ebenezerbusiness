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

test("un forwarding relie paiement et sortie par forwardingId sans utiliser le tracking code", () => {
  const payment = { requestId: "payment", trackingCode: "AT02326", agency: "LSHI" as const, amountUsd: 117, occurredAt: "2026-09-01T21:28:33Z" };
  const forwarding = { ...orchestration, requestId: "payment", trackingCode: "AT02326", forwardingId: "forwarding-1", parcelId: "parcel-forwarding", state: "COMPLETED", cashEventId: "cash", storageEventId: "storage", updatedAt: payment.occurredAt };
  const result = reconcileOperations({ payments: [payment], cash: [{ ...payment, eventId: "cash" }], storage: [{ requestId: "legacy-storage-request", eventId: "storage", agency: "LSHI", trackingCode: "AT02326", weightKg: 9, occurredAt: payment.occurredAt, forwardingId: "forwarding-1", parcelId: "parcel-forwarding" }], orchestrations: [forwarding], closures: [], now });
  assert.equal(result.anomalies.length, 0);
});

test("deux identités distinctes ne sont jamais fusionnées par trackingCode", () => {
  const payment = { requestId: "payment", trackingCode: "AT02326", agency: "LSHI" as const, amountUsd: 117, occurredAt: "2026-09-01T21:28:33Z" };
  const result = reconcileOperations({ payments: [payment], cash: [{ ...payment, eventId: "cash" }], storage: [{ requestId: "other", eventId: "storage", agency: "LSHI", trackingCode: "AT02326", weightKg: 5, occurredAt: payment.occurredAt, forwardingId: "forwarding-2" }], orchestrations: [{ ...orchestration, requestId: "payment", forwardingId: "forwarding-1" }], closures: [], now });
  assert.ok(result.anomalies.some((row) => row.type === "PAIEMENT_SANS_SORTIE_STOCKAGE"));
  assert.ok(result.anomalies.some((row) => row.type === "SORTIE_SANS_PAIEMENT_CANONIQUE"));
});

test("un PENDING sans paiement canonique devient une information légitime", () => {
  const result = reconcileOperations({ payments: [], cash: [], storage: [], orchestrations: [{ ...orchestration, paymentCreated: false }], closures: [], now });
  assert.equal(result.anomalies.length, 0);
  assert.equal(result.information[0].type, "ORCHESTRATION_EN_ATTENTE_LEGITIME");
  assert.equal(result.information[0].status, "INFORMATION");
  assert.equal(result.metrics.legitimatePending, 1);
});

test("le compteur distingue alertes techniques, dossiers réels et période", () => {
  const payment = { requestId: "r1", trackingCode: "AT00126", agency: "LSHI" as const, amountUsd: 30, occurredAt: "2026-09-10T10:00:00Z", parcelId: "parcel-1" };
  const result = reconcileOperations({ payments: [payment], cash: [], storage: [], orchestrations: [{ ...orchestration, parcelId: "parcel-1", updatedAt: payment.occurredAt }], closures: [], now, protectionsDeployedAt: new Date("2026-09-12T02:39:40Z") });
  assert.equal(result.anomalies.length, 3);
  assert.equal(result.metrics.realDossiers, 1);
  assert.equal(result.metrics.historical, 3);
  assert.equal(result.metrics.newAfterProtections, 0);
});

test("le backlog certifié passe de 42 alertes brutes à 39 alertes sur 13 dossiers", () => {
  const occurredAt = "2026-09-10T10:00:00Z";
  const payments = Array.from({ length: 13 }, (_, index) => ({
    requestId: `incomplete-${index}`,
    trackingCode: `AT${String(index).padStart(5, "0")}26`,
    agency: "LSHI" as const,
    amountUsd: 30,
    occurredAt,
    parcelId: `parcel-${index}`
  }));
  const incomplete = payments.map((payment) => ({
    ...orchestration,
    requestId: payment.requestId,
    trackingCode: payment.trackingCode,
    parcelId: payment.parcelId,
    updatedAt: occurredAt
  }));
  const forwardingId = "forwarding-at02326";
  const completedPayment = { requestId: "payment-at02326", trackingCode: "AT02326", agency: "LSHI" as const, amountUsd: 117, occurredAt, forwardingId };
  const completedOrchestration = { ...orchestration, ...completedPayment, state: "COMPLETED", cashEventId: "cash-at02326", storageEventId: "storage-at02326" };
  const legitimatePending = { ...orchestration, requestId: "pending-at43326", trackingCode: "AT43326", paymentCreated: false, updatedAt: occurredAt };
  const result = reconcileOperations({
    payments: [...payments, completedPayment],
    cash: [{ ...completedPayment, eventId: "cash-at02326" }],
    storage: [{ requestId: "legacy-storage-at02326", eventId: "storage-at02326", agency: "LSHI", trackingCode: "AT02326", weightKg: 9, occurredAt, forwardingId }],
    orchestrations: [...incomplete, completedOrchestration, legitimatePending],
    closures: [],
    now
  });
  assert.equal(result.anomalies.length, 39);
  assert.equal(result.metrics.realDossiers, 13);
  assert.equal(result.metrics.historical, 39);
  assert.equal(result.metrics.newAfterProtections, 0);
  assert.equal(result.metrics.legitimatePending, 1);
  assert.equal(result.information[0].trackingCode, "AT43326");
  assert.equal(result.anomalies.some((row) => row.trackingCode === "AT02326"), false);
});
