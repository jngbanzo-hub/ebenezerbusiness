import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { AgentWriteSessionError, getVerifiedAgentWriteToken } from "./verified-agent-token.ts";

function auth(options: { current?: string; valid?: string[]; refreshed?: string }) {
  const calls = { refresh: 0, verified: [] as string[] };
  return {
    calls,
    client: {
      async getSession() { return { data: { session: options.current ? { access_token: options.current } : null } }; },
      async getUser(jwt: string) { calls.verified.push(jwt); return { data: { user: options.valid?.includes(jwt) ? { id: "agent" } : null }, error: options.valid?.includes(jwt) ? null : new Error("invalid token") }; },
      async refreshSession() { calls.refresh += 1; return { data: { session: options.refreshed ? { access_token: options.refreshed } : null }, error: options.refreshed ? null : new Error("refresh failed") }; }
    }
  };
}

test("conserve un JWT Agent encore accepté par Supabase Auth", async () => {
  const value = auth({ current: "valid", valid: ["valid"] });
  assert.equal(await getVerifiedAgentWriteToken(value.client), "valid");
  assert.equal(value.calls.refresh, 0);
});

test("rafraîchit un JWT local refusé avant la commande Stockages", async () => {
  const value = auth({ current: "stale", refreshed: "fresh", valid: ["fresh"] });
  assert.equal(await getVerifiedAgentWriteToken(value.client), "fresh");
  assert.equal(value.calls.refresh, 1);
  assert.deepEqual(value.calls.verified, ["stale", "fresh"]);
});

test("refuse une session absente ou impossible à vérifier", async () => {
  await assert.rejects(() => getVerifiedAgentWriteToken(auth({}).client), AgentWriteSessionError);
  await assert.rejects(() => getVerifiedAgentWriteToken(auth({ current: "stale" }).client), AgentWriteSessionError);
});

test("borne toute la certification Auth à cinq secondes sans retry financier", async () => {
  const never = new Promise<never>(() => undefined);
  const startedAt = Date.now();
  await assert.rejects(
    () => getVerifiedAgentWriteToken({
      async getSession() { return never; },
      async getUser() { return never; },
      async refreshSession() { return never; }
    }),
    (error) => error instanceof AgentWriteSessionError && error.code === "SESSION_EXPIRED"
  );
  assert.ok(Date.now() - startedAt >= 4_900);
  assert.ok(Date.now() - startedAt < 6_000);
});
