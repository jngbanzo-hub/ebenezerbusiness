import assert from "node:assert/strict";
import test from "node:test";

import {
  createQrAssignmentRequestId,
  messageForQrError,
  resolveQrById,
  resolveQrCandidate,
  submitQrAssociation
} from "./qr-association-client";

const activeAuth = {
  getSession: async () => ({ data: { session: { access_token: "agent-token" } } }),
  refreshSession: async () => ({ data: { session: null }, error: null })
};

test("prévalide un QR UNASSIGNED avec la session active sans mutation", async () => {
  let method = "";
  const candidate = await resolveQrCandidate(activeAuth, 13, async (_input, init) => {
    method = init?.method ?? "GET";
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer agent-token");
    return Response.json({ qrId: "EEBQR000013", displayNumber: 13, status: "UNASSIGNED", version: 1 });
  });
  assert.equal(method, "GET");
  assert.equal(candidate.version, 1);
});

test("résout un qrId scanné par le résolveur Agent officiel", async () => {
  const candidate = await resolveQrById(activeAuth, "EEBQR000013", async (input) => {
    assert.equal(String(input), "/api/agent/qr/resolve?displayNumber=13");
    return Response.json({
      qrId: "EEBQR000013",
      displayNumber: 13,
      status: "ASSIGNED",
      agency: "KLZ",
      trackingCode: "AT09426",
      version: 2
    });
  });
  assert.equal(candidate.agency, "KLZ");
  assert.equal(candidate.trackingCode, "AT09426");
});

test("refuse un identifiant QR non officiel avant tout appel réseau", async () => {
  let called = false;
  await assert.rejects(
    resolveQrById(activeAuth, "QR-013", async () => {
      called = true;
      return Response.json({});
    }),
    /QR inconnu\/non reconnu/
  );
  assert.equal(called, false);
});

test("refuse une session expirée avant tout fetch", async () => {
  let called = false;
  await assert.rejects(
    resolveQrCandidate({ ...activeAuth, getSession: async () => ({ data: { session: null } }) }, 13, async () => { called = true; return Response.json({}); }),
    /session a expiré/i
  );
  assert.equal(called, false);
});

test("envoie uniquement le payload autorisé après confirmation", async () => {
  const payload = { displayNumber: 13, agency: "KLZ" as const, trackingCode: "AT09426", expectedVersion: 1, requestId: "00000000-0000-4000-8000-000000000013" };
  await submitQrAssociation(activeAuth, payload, async (_input, init) => {
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), payload);
    assert.equal(/certified|source|serviceRole|actorId|assignedBy/.test(String(init?.body)), false);
    return Response.json({ ...payload, qrId: "EEBQR000013", status: "ASSIGNED", version: 2, replayed: false });
  });
});

test("génère un requestId automatiquement", () => {
  assert.equal(createQrAssignmentRequestId(() => "00000000-0000-4000-8000-000000000013"), "00000000-0000-4000-8000-000000000013");
});

test("traduit les erreurs QR attendues sans détail interne", () => {
  for (const code of ["QR_NOT_FOUND", "QR_NOT_UNASSIGNED", "QR_AGENCY_ACCESS_DENIED", "IDENTITY_NOT_FOUND", "QR_VERSION_CONFLICT", "QR_PARCEL_ALREADY_ASSIGNED", "IDENTITY_SERVICE_UNAVAILABLE"]) {
    assert.doesNotMatch(messageForQrError(code), /sql|table|token|stack/i);
  }
});
