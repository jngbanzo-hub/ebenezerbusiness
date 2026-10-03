import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { destinationPaymentFingerprint, originalPendingRequestId } from "./destination-payment-retry-guard.ts";

const original = "507d8e6c-da96-48c5-9eb6-d010c816855c";
const identity = {
  actorId: "agent-fih", agency: "FIH", trackingCode: "SE22426",
  parcelId: "parcel-fih", expectedAmount: 54, paidAmount: 54,
  fingerprint: "a".repeat(64)
};
const candidate = {
  requestId: original, ...identity, forwardingId: null, state: "PENDING", paymentCreated: false,
  paymentResponse: null, cashEventId: null, storageEventId: null
};
const noEffects = {
  canonicalPayment: false, sheetsPayment: false, cashEvent: false,
  storageEvent: false, concurrentCompleted: false
};

test("A: identical pending payment with no effects reuses its original request id", () => {
  assert.equal(originalPendingRequestId(identity, candidate, noEffects), original);
});

test("B-D: canonical, Sheets, or Cash effect refuses reuse", () => {
  for (const effect of ["canonicalPayment", "sheetsPayment", "cashEvent"]) {
    assert.equal(originalPendingRequestId(identity, candidate, { ...noEffects, [effect]: true }), null);
  }
});

test("E: a different fingerprint starts a distinct command", () => {
  assert.equal(originalPendingRequestId({ ...identity, fingerprint: "b".repeat(64) }, candidate, noEffects), null);
  assert.equal(originalPendingRequestId(identity, null, noEffects), null);
});

test("F: COMPLETED and any partial effect refuse another payment", () => {
  assert.equal(originalPendingRequestId(identity, { ...candidate, state: "COMPLETED" }, noEffects), null);
  assert.equal(originalPendingRequestId(identity, { ...candidate, forwardingId: "forwarding-1" }, noEffects), null);
  for (const field of ["paymentCreated", "paymentResponse", "cashEventId", "storageEventId"]) {
    assert.equal(originalPendingRequestId(identity, { ...candidate, [field]: field === "paymentCreated" ? true : "effect" }, noEffects), null);
  }
  assert.equal(originalPendingRequestId(identity, candidate, { ...noEffects, concurrentCompleted: true }), null);
});

test("G: simultaneous resolution never allocates a second request id", async () => {
  const resolved = await Promise.all(Array.from({ length: 2 }, async () => originalPendingRequestId(identity, candidate, noEffects)));
  assert.deepEqual(resolved, [original, original]);
});

test("identity, parcel, actor and amounts must all match", () => {
  for (const [field, value] of [["actorId", "another-agent"], ["agency", "LSHI"],
    ["trackingCode", "SE22426B"], ["parcelId", "another-parcel"],
    ["expectedAmount", 55], ["paidAmount", 55]]) {
    assert.equal(originalPendingRequestId({ ...identity, [field]: value }, candidate, noEffects), null);
  }
});

test("fingerprint is independent of request id but includes exact payment context", () => {
  const command = {
    actorUserId: "agent-fih", agency: "FIH", codeColis: "SE22426",
    destinationCode: "FIH", modePaiement: "ESPECES", montantPaye: 54,
    observation: "", referencePaiement: "", operationContext: {
      type: "STORAGE_DESTINATION_PAYMENT", sourceDestinationCode: "FIH",
      collectionSiteCode: "FIH", canonicalWeightKg: 6,
      canonicalExpectedAmount: 54, canonicalTotalPaid: 0, parcelId: "parcel-fih"
    }
  };
  assert.notEqual(destinationPaymentFingerprint(command), destinationPaymentFingerprint({ ...command, operationContext: { ...command.operationContext, parcelId: "other-parcel" } }));
  assert.notEqual(destinationPaymentFingerprint(command), destinationPaymentFingerprint({ ...command, agency: "LSHI" }));
});

test("server checks read-only canonical, Sheets, Cash and storage before substituting the id", () => {
  const source = readFileSync(new URL("./destination-payment-parcel.ts", import.meta.url), "utf8");
  const guard = source.slice(source.indexOf("async function resolveOriginalPendingRequestId"));
  for (const proof of ["readCanonicalPaymentsByRequestIds", "readCompleteAgencyPayments", 'from("cash_events")',
    'from("stockage_events")', 'eq("state", "COMPLETED")', "originalPendingRequestId"]) {
    assert.ok(guard.includes(proof), `${proof} missing`);
  }
  assert.match(source, /paymentRequestId: effectiveInput\.paymentRequestId/);
  assert.match(guard, /page\.scannedRows !== expected \|\| page\.nextRow !== row \+ expected/);
  assert.doesNotMatch(guard, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
