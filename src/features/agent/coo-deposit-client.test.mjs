import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessCooDepositAction,
  CooDepositRequestError,
  submitCooDeposit
} from "./coo-deposit-client.ts";

const command = {
  trackingCode: "JL114826B",
  requestId: "phase-r-jl114826b-20260731-01",
  confirmationPhysicalDeposit: true
};

test("réserve l'action au profil Agent COTONOU/COO", () => {
  assert.equal(
    canAccessCooDepositAction({ role: "AGENT", agence: "COTONOU", site: "COO" }),
    true
  );
  assert.equal(
    canAccessCooDepositAction({ role: "AGENT", agence: "FIH", site: "FIH" }),
    false
  );
  assert.equal(
    canAccessCooDepositAction({ role: "AGENT", agence: "COTONOU", site: "FIH" }),
    false
  );
});

test("envoie uniquement la commande autorisée avec le Bearer token", async () => {
  let captured = {};
  const result = await submitCooDeposit("secret-session-token", command, async (input, init) => {
    captured = { input, init };
    return Response.json({
      state: "SUCCESS",
      replayed: false,
      eventId: "event-001",
      trackingCode: "JL114826B",
      version: 1,
      agency: "COO"
    }, { status: 201 });
  });

  assert.equal(captured.input, "/api/agent/logistics/entry-coo");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.Authorization, "Bearer secret-session-token");
  assert.deepEqual(JSON.parse(String(captured.init.body)), command);
  assert.equal(result.replayed, false);
});

test("reconnaît un succès rejoué sans changer la commande", async () => {
  const result = await submitCooDeposit("session-token", command, async () =>
    Response.json({
      state: "SUCCESS",
      replayed: true,
      eventId: "event-001",
      trackingCode: "JL114826B",
      version: 1,
      agency: "COO"
    })
  );
  assert.equal(result.replayed, true);
});

test("expose une erreur métier et un conflit sans donnée technique", async () => {
  await assert.rejects(
    submitCooDeposit("session-token", command, async () =>
      Response.json(
        { error: { code: "IDEMPOTENCY_CONFLICT", message: "Commande différente." } },
        { status: 409 }
      )
    ),
    (error) =>
      error instanceof CooDepositRequestError &&
      error.code === "IDEMPOTENCY_CONFLICT" &&
      error.status === 409 &&
      error.message === "Commande différente."
  );
});

test("refuse une session absente avant tout appel réseau", async () => {
  let called = false;
  await assert.rejects(
    submitCooDeposit(" ", command, async () => {
      called = true;
      return Response.json({});
    }),
    (error) =>
      error instanceof CooDepositRequestError && error.code === "UNAUTHORIZED"
  );
  assert.equal(called, false);
});
