import assert from "node:assert/strict";
import test from "node:test";

import { acquireForwardingSubmissionLock, fingerprintForwardingIntent, getOrCreateForwardingAttempt, restoreForwardingAttempt, transitionForwardingAttempt } from "./forwarding-attempt";

test("une tentative ambiguë conserve le même paymentRequestId", () => {
  const fingerprint = fingerprintForwardingIntent({ trackingCode: "JL1", sourceAgency: "LSHI", paymentMode: "ESPECES", optionalReference: "", optionalObservation: "" });
  const first = getOrCreateForwardingAttempt(null, fingerprint, () => "id-1");
  const ambiguous = transitionForwardingAttempt(first, "result_unknown_retry_same_id");
  assert.equal(getOrCreateForwardingAttempt(ambiguous, fingerprint, () => "id-2").paymentRequestId, "id-1");
});

test("un refresh restaure le paymentRequestId certifié par le serveur", () => {
  const fingerprint = fingerprintForwardingIntent({ trackingCode: "JL27226", sourceAgency: "FIH", paymentMode: "ESPECES", optionalReference: "", optionalObservation: "" });
  const restored = restoreForwardingAttempt("a459a340-ebf5-432b-b76b-b67dd3243b30", fingerprint);
  assert.equal(restored.paymentRequestId, "a459a340-ebf5-432b-b76b-b67dd3243b30");
  assert.equal(getOrCreateForwardingAttempt(restored, fingerprint, () => "new-id").paymentRequestId, restored.paymentRequestId);
});

test("un double clic ne lance qu’une soumission", () => {
  const lock = { current: false };
  assert.equal(acquireForwardingSubmissionLock(lock), true);
  assert.equal(acquireForwardingSubmissionLock(lock), false);
});

test("une autre recherche ou un succès produit une nouvelle tentative", () => {
  const first = getOrCreateForwardingAttempt(null, "A", () => "id-1");
  assert.equal(getOrCreateForwardingAttempt(first, "B", () => "id-2").paymentRequestId, "id-2");
  assert.equal(getOrCreateForwardingAttempt(transitionForwardingAttempt(first, "success"), "A", () => "id-3").paymentRequestId, "id-3");
});
