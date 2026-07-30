import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootRoute = await readFile(
  new URL("../src/app/api/agent/transferts/route.ts", import.meta.url),
  "utf8"
);
const helper = await readFile(
  new URL("../src/server/transferts-agent-actions.ts", import.meta.url),
  "utf8"
);
const flags = await readFile(
  new URL("../src/server/transferts-feature-flags.ts", import.meta.url),
  "utf8"
);
const actionRoutes = await Promise.all(
  ["confirm-code", "confirm-withdrawal", "confirm-transfer", "flag-review", "cancel"]
    .map((name) => readFile(new URL(`../src/app/api/agent/transferts/[transferId]/${name}/route.ts`, import.meta.url), "utf8"))
);

test("les six routes POST existent sans PUT, PATCH ou DELETE", () => {
  assert.ok(rootRoute.includes("export async function POST"));
  for (const route of actionRoutes) assert.ok(route.includes("export async function POST"));
  for (const route of [rootRoute, ...actionRoutes]) {
    assert.equal(/export async function (PUT|PATCH|DELETE)/.test(route), false);
  }
});

test("l’identité serveur précède le verrou, qui précède tout appel distant", () => {
  for (const source of [rootRoute, helper]) {
    const checkedSource = source === rootRoute
      ? source.slice(source.indexOf("export async function POST"))
      : source;
    const auth = checkedSource.indexOf("await authorizeAgentRequest");
    const gate = checkedSource.indexOf("if (!areTransfertsWritesEnabled())");
    const remote = checkedSource.indexOf("await callTransferts");
    assert.ok(auth >= 0 && gate > auth && remote > gate);
    assert.ok(source.includes('"WRITES_DISABLED"'));
  }
});

test("le flag est strict, privé et désactivé sauf valeur exacte true", () => {
  assert.ok(flags.includes('process.env.TRANSFERTS_API_WRITES_ENABLED === "true"'));
  assert.equal(flags.includes("NEXT_PUBLIC_TRANSFERTS_API_WRITES_ENABLED"), false);
});

test("l’acteur et l’agence sont reconstruits depuis l’identité autorisée", () => {
  assert.ok(rootRoute.includes("agencyFrom, agentFrom") === false);
  assert.ok(rootRoute.includes("agentFrom: identity.email"));
  assert.ok(rootRoute.includes("identity.site"));
  assert.ok(helper.includes("agency: identity.site"));
  assert.equal(helper.includes("body.agency"), false);
});

test("aucun retry automatique d’écriture n’est implémenté", () => {
  for (const source of [rootRoute, helper]) {
    assert.equal(source.includes("retry"), false);
    assert.equal(source.includes("setInterval"), false);
  }
  assert.ok(helper.includes("RESULT_REQUIRES_VERIFICATION"));
});
