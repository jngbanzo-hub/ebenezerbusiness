import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { authenticatedRead, AuthenticatedRequestError, readJsonOrThrow } from "./authenticated-fetch.ts";

function auth(current?: string, refreshed?: string) {
  let refreshes = 0;
  return {
    value: {
      async getSession() { return { data: { session: current ? { access_token: current } : null } }; },
      async refreshSession() { refreshes += 1; return { data: { session: refreshed ? { access_token: refreshed } : null }, error: refreshed ? null : new Error("expired") }; }
    },
    refreshes: () => refreshes
  };
}

test("token valide: succès direct sans refresh", async () => {
  const session = auth("valid");
  let calls = 0;
  const response = await authenticatedRead(session.value, "/read", {}, async (_url, init) => {
    calls += 1;
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer valid");
    return new Response("{}", { status: 200 });
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(session.refreshes(), 0);
});

test("401: refresh puis une seule nouvelle tentative avec le nouveau JWT", async () => {
  const session = auth("expired", "fresh");
  const tokens: string[] = [];
  const response = await authenticatedRead(session.value, "/read", {}, async (_url, init) => {
    tokens.push((init?.headers as Record<string, string>).Authorization);
    return new Response("{}", { status: tokens.length === 1 ? 401 : 200 });
  });
  assert.equal(response.status, 200);
  assert.deepEqual(tokens, ["Bearer expired", "Bearer fresh"]);
  assert.equal(session.refreshes(), 1);
});

test("session définitivement expirée: aucun cycle de retry", async () => {
  const session = auth("expired");
  await assert.rejects(
    () => authenticatedRead(session.value, "/read", {}, async () => new Response("{}", { status: 401 })),
    (error) => error instanceof AuthenticatedRequestError && error.code === "SESSION_EXPIRED"
  );
  assert.equal(session.refreshes(), 1);
});

for (const status of [502, 503, 504]) {
  test(`${status}: une seule nouvelle tentative de lecture`, async () => {
    const session = auth("valid");
    let calls = 0;
    const response = await authenticatedRead(session.value, "/read", {}, async () => {
      calls += 1;
      return new Response("{}", { status: calls === 1 ? status : 200 });
    });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });
}

test("erreur métier et accès interdit restent explicites", async () => {
  await assert.rejects(
    () => readJsonOrThrow(new Response(JSON.stringify({ code: "PARCEL_NOT_IN_STOCK", message: "Colis absent du Stockage." }), { status: 409 }), "Indisponible"),
    (error) => error instanceof AuthenticatedRequestError && error.code === "PARCEL_NOT_IN_STOCK" && error.message === "Colis absent du Stockage."
  );
  await assert.rejects(
    () => readJsonOrThrow(new Response("{}", { status: 403 }), "Indisponible"),
    (error) => error instanceof AuthenticatedRequestError && error.code === "ACCESS_DENIED"
  );
});

test("une réponse vide réussie reste une réponse normale", async () => {
  assert.equal(await readJsonOrThrow<null>(new Response("null", { status: 200 }), "Indisponible"), null);
});
