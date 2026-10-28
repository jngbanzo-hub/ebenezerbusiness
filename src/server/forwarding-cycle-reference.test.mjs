import assert from "node:assert/strict";
import test from "node:test";

import { forwardingCycleFingerprint, forwardingCycleReference } from "./forwarding-cycle-reference.ts";

const requestId = "EF4381D9-3F90-5DF3-C8F7-37620A90121F";

test("premier cycle : référence métier historique inchangée", () => {
  assert.equal(forwardingCycleReference("OT04426-KLZ-LSHI", requestId, false), "OT04426-KLZ-LSHI");
});

test("après annulation : nouveau cycle lié uniquement au paymentRequestId original", () => {
  const reference = forwardingCycleReference("OT04426-KLZ-LSHI", requestId, true);
  assert.equal(reference, "OT04426-KLZ-LSHI-REF4381D93F905DF3C8F73");
  assert.equal(forwardingCycleReference("OT04426-KLZ-LSHI", requestId, true), reference);
  assert.notEqual(reference, "OT04426-KLZ-LSHI");
  assert.ok(forwardingCycleReference(`${"X".repeat(63)}-LSHI-LSHI`, requestId, true).length <= 96);
});

test("empreinte de commande distincte par cycle annulé, stable pour les reprises", () => {
  const base = "a".repeat(64);
  const firstCancelled = "00000000-0000-0000-0000-000000000001";
  const secondCancelled = "00000000-0000-0000-0000-000000000002";
  assert.equal(forwardingCycleFingerprint(base, null), base);
  const next = forwardingCycleFingerprint(base, firstCancelled);
  assert.match(next, /^[0-9a-f]{64}$/);
  assert.notEqual(next, base);
  assert.equal(forwardingCycleFingerprint(base, firstCancelled), next);
  assert.notEqual(forwardingCycleFingerprint(base, secondCancelled), next);
});
