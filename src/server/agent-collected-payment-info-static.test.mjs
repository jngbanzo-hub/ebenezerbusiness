import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reader = readFileSync(new URL("./agent-collected-payment-info.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/agent/encaissements/collected-info/route.ts", import.meta.url), "utf8");

test("le complément est réservé à l'Agent authentifié de sa propre agence et ne lit que les sources existantes", () => {
  assert.match(route, /authorizeAgentRequest\(request\)/);
  assert.match(route, /requireStorageAgency\(auth\.identity\.site\)/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  for (const table of ["stockage_parcels", "stockage_forwardings", "stockage_payment_orchestrations"]) {
    assert.match(reader, new RegExp(`from\\("${table}"\\)`));
  }
  assert.match(reader, /readCanonicalPaymentsByRequestIds/);
  assert.doesNotMatch(reader, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
});

test("homonymes et acheminements échouent en mode prudent", () => {
  assert.match(reader, /parcels\.length !== 1/);
  assert.match(reader, /forwarding\?\.origin_agency !== alias\.originAgency/);
  assert.match(reader, /identity\.forwardingId\) \{/);
  assert.match(reader, /rows\.length !== 1/);
});
