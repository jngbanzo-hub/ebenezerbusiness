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
  for (const table of ["stockage_parcels", "stockage_forwardings", "stockage_payment_orchestrations", "stockage_events"]) {
    assert.match(reader, new RegExp(`from\\("${table}"\\)`));
  }
  assert.match(reader, /readCanonicalPaymentsByRequestIds/);
  assert.match(reader, /readAdminPayments/);
  assert.doesNotMatch(reader, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
});

test("l'auteur du paiement vient de P1 et de l'orchestration du même request_id", () => {
  assert.match(reader, /actor_name,paid_amount/);
  assert.match(reader, /verifiedPaymentAgent\(lookup\.payment\.agent, row\.actor_name\)/);
  assert.match(reader, /readCanonicalPaymentsByRequestIds\(\[orchestration\.requestId\]\)/);
});

test("la remise physique n'est lue qu'après absence de paiement destination confirmé", () => {
  assert.match(reader, /if \(!row\) \{/);
  assert.match(reader, /parcel\.delivery_status !== "DELIVERED"/);
  assert.match(reader, /\.eq\("event_id", identity\.deliveredEventId\)\.maybeSingle\(\)/);
  assert.match(reader, /\.eq\("target_event_id", identity\.deliveredEventId\)\.limit\(1\)/);
  assert.match(reader, /confirmedDeliveryEvidence/);
  assert.match(reader, /confirmedCooPaymentSnapshot/);
});

test("homonymes et acheminements échouent en mode prudent", () => {
  assert.match(reader, /parcels\.length !== 1/);
  assert.match(reader, /forwarding\?\.origin_agency !== alias\.originAgency/);
  assert.match(reader, /identity\.forwardingId\) \{/);
  assert.match(reader, /uniqueCompletedPaymentCandidate\(current\.data \?\? \[\], historical\.data \?\? \[\]\)/);
  assert.match(reader, /delivered_event_id/);
  assert.match(reader, /\.is\("parcel_id", null\)\.eq\("stockage_event_id", identity\.deliveredEventId\)/);
  assert.match(reader, /\.eq\("parcel_id", identity\.parcelId\)/);
});
