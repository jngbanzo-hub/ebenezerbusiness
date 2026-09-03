import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./destination-payment-parcel.ts", import.meta.url), "utf8");

test("the existing request is checked before storage resolution and PARCEL_ALREADY_PAID", () => {
  const existing = source.indexOf("readPaymentOrchestration(input.paymentRequestId)");
  const storage = source.indexOf("resolveDestinationPaymentParcel(input.trackingCode", existing);
  const paid = source.indexOf("if (parcel.soldeRestant <= 0)", storage);
  const refusal = source.indexOf('throw new StockagesV2Error("PARCEL_ALREADY_PAID"', paid);
  assert.ok(existing >= 0 && storage > existing && paid > storage && refusal > paid);
});

test("resume is limited to the same pending request and rejects an existing storage effect", () => {
  assert.match(source, /readPaymentOrchestration\(input\.paymentRequestId\)/);
  assert.match(source, /\.eq\("request_id", requestId\)/);
  assert.match(source, /orchestration\.state !== "PENDING"/);
  assert.match(source, /orchestration\.stockage_event_id/);
  assert.match(source, /PAYMENT_ORCHESTRATION_PARTIAL_EFFECT/);
  assert.match(source, /payment\.paymentRequestId\?\.toLowerCase\(\) === input\.paymentRequestId\.toLowerCase\(\)/);
});

test("resume certifies the canonical payment then checkpoints and finalizes without Edge or Apps Script", () => {
  const helper = source.slice(source.indexOf("async function resumePendingPaidDestination"), source.indexOf("function completedReplayPayload"));
  assert.match(helper, /await readAdminPayments\(trace\)/);
  assert.match(helper, /canonical\.length !== 1/);
  assert.ok(helper.indexOf('rpc("checkpoint_paid_destination_payment"') < helper.indexOf('rpc("finalize_paid_destination_orchestration"'));
  assert.doesNotMatch(helper, /paiements-agents-enregistrer-paiement|fetch\(/);
});

test("native and forwarding payment rules remain separated", () => {
  assert.match(source, /if \(parcel\.forwardingId\) return null/);
  assert.match(source, /money\(payment\.poidsKg \?\? 0\) === money\(parcel\.poidsKg\)/);
  assert.match(source, /payment\.agent\.trim\(\) === String\(orchestration\.actor_name\)\.trim\(\)/);
});

test("completed orchestration replays before an AVAILABLE storage lookup", () => {
  const completed = source.indexOf('existing?.state === "COMPLETED"');
  const storage = source.indexOf("resolveDestinationPaymentParcel(input.trackingCode", completed);
  assert.ok(completed >= 0 && storage > completed);
  assert.match(source.slice(completed, storage), /cash_event_id/);
  assert.match(source.slice(completed, storage), /stockage_event_id/);
});

test("another request id keeps PARCEL_ALREADY_PAID protection", () => {
  assert.match(source, /if \(!orchestration\) return null/);
  assert.match(source, /if \(resumed\) return resumed;\s*throw new StockagesV2Error\("PARCEL_ALREADY_PAID"/);
});

test("canonical proof covers request, code, destination, amount, balance, weight, agent and mode", () => {
  for (const proof of ["paymentRequestId", "codeColis", "destinationCode", "montantPaye", "montantAttendu", "soldeRestant", "poidsKg", "actor_name", "modePaiement"]) {
    assert.match(source, new RegExp(proof));
  }
  assert.match(source, /canonical\.length !== 1/);
});

test("checkpointed retry skips checkpoint and uses canonical finalize", () => {
  assert.match(source, /if \(!orchestration\.payment_created \|\| !orchestration\.payment_response\)/);
  assert.match(source, /rpc\("finalize_paid_destination_orchestration"/);
});

test("a recorded storage effect is never recreated by the web resume path", () => {
  assert.match(source, /orchestration\.state !== "PENDING" \|\| orchestration\.stockage_event_id/);
  assert.match(source, /from\("stockage_events"\).*eq\("request_id", input\.paymentRequestId\)/s);
  assert.match(source, /storageRows\?\.length/);
  assert.match(source, /PAYMENT_ORCHESTRATION_PARTIAL_EFFECT/);
});

test("an existing cash effect is certified then left to the canonical idempotent finalize", () => {
  assert.match(source, /from\("cash_events"\).*source_request_id/s);
  assert.match(source, /existingCash\.metadata\?\.commandFingerprint !== orchestration\.command_fingerprint/);
  assert.doesNotMatch(source, /insert\([^)]*cash_events/);
});

test("the resume path never generates or substitutes a request id", () => {
  const helper = source.slice(source.indexOf("async function resumePendingPaidDestination"), source.indexOf("async function readNativeAmountPaid"));
  assert.doesNotMatch(helper, /randomUUID|crypto\.randomUUID|uuidv4/);
  assert.match(helper, /p_request_id: input\.paymentRequestId/);
});
