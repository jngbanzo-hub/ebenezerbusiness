import assert from "node:assert/strict";
import test from "node:test";

import { StockagesV2Error } from "./stockages-v2";
import { buildForwardingFingerprint, selectForwardingResume } from "./stockages-forwarding-resume";

const fingerprint = buildForwardingFingerprint({ trackingCode: "JL27226", origin: "FIH", destination: "KLZ", paymentMode: "ESPECES", optionalReference: "", optionalObservation: "", amountExpectedUsd: 14 });
const row = { request_id: "a459a340-ebf5-432b-b76b-b67dd3243b30", command_fingerprint: fingerprint, actor_id: "agent-klz", state: "PAYMENT_IN_PROGRESS" };

test("une orchestration absente autorise le client à préparer une nouvelle demande", () => {
  assert.equal(selectForwardingResume([], { actorId: "agent-klz", expectedFingerprint: fingerprint }), null);
});

test("PAYMENT_IN_PROGRESS identique restaure le requestId existant", () => {
  assert.deepEqual(selectForwardingResume([row], { actorId: "agent-klz", expectedFingerprint: fingerprint }), { state: "PAYMENT_IN_PROGRESS", resumable: true, paymentRequestId: row.request_id });
});

test("PAID_AWAITING_ARRIVAL interdit un nouveau paiement", () => {
  assert.deepEqual(selectForwardingResume([{ ...row, state: "PAID_AWAITING_ARRIVAL" }], { actorId: "agent-klz", expectedFingerprint: fingerprint }), { state: "PAID_AWAITING_ARRIVAL", resumable: false });
});

test("un fingerprint différent produit un conflit", () => {
  assert.throws(() => selectForwardingResume([row], { actorId: "agent-klz", expectedFingerprint: "0".repeat(64) }), (error) => error instanceof StockagesV2Error && error.code === "IDEMPOTENCY_CONFLICT");
});

test("un autre Agent est refusé", () => {
  assert.throws(() => selectForwardingResume([row], { actorId: "autre-agent", expectedFingerprint: fingerprint }), (error) => error instanceof StockagesV2Error && error.code === "FORWARDING_RESUME_FORBIDDEN");
});
