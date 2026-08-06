import assert from "node:assert/strict";
import test from "node:test";

import { fingerprintForwardingIntent, getOrCreateForwardingAttempt, transitionForwardingAttempt } from "./forwarding-attempt";

test("une tentative ambiguë conserve le même paymentRequestId", () => {
  const fingerprint = fingerprintForwardingIntent({ trackingCode: "JL1", sourceAgency: "LSHI", paymentMode: "ESPECES", optionalReference: "", optionalObservation: "" });
  const first = getOrCreateForwardingAttempt(null, fingerprint, () => "id-1");
  const ambiguous = transitionForwardingAttempt(first, "result_unknown_retry_same_id");
  assert.equal(getOrCreateForwardingAttempt(ambiguous, fingerprint, () => "id-2").paymentRequestId, "id-1");
});

test("une autre recherche ou un succès produit une nouvelle tentative", () => {
  const first = getOrCreateForwardingAttempt(null, "A", () => "id-1");
  assert.equal(getOrCreateForwardingAttempt(first, "B", () => "id-2").paymentRequestId, "id-2");
  assert.equal(getOrCreateForwardingAttempt(transitionForwardingAttempt(first, "success"), "A", () => "id-3").paymentRequestId, "id-3");
});
