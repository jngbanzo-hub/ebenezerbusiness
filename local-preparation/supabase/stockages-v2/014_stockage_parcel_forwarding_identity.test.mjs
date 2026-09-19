import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync(new URL("./014_stockage_parcel_forwarding_identity.sql",import.meta.url),"utf8");
const rollback=readFileSync(new URL("./014_stockage_parcel_forwarding_identity.rollback.sql",import.meta.url),"utf8");
const helper=readFileSync(new URL("../../../src/server/storage-parcel-identity.ts",import.meta.url),"utf8");
const { storageParcelDisplayCode, selectStorageParcel, hasStorageParcelCollision } = await import("../../../src/server/storage-parcel-identity.ts");
const normalizeSqlFormatting=(sql)=>sql.toLowerCase().replace(/\s+/g,"");

test("SQL definition guards ignore formatting but preserve semantics",()=>{
  const expected="on conflict(agency,tracking_code) do nothing";
  const production="ON CONFLICT (agency, tracking_code)\n  DO NOTHING";
  assert.equal(normalizeSqlFormatting(expected),normalizeSqlFormatting(production));
  assert.notEqual(normalizeSqlFormatting(expected),normalizeSqlFormatting("on conflict (agency,tracking_code) do update set version=excluded.version"));
  assert.notEqual(normalizeSqlFormatting(expected),normalizeSqlFormatting("on conflict (tracking_code) do nothing"));
  assert.match(migration,/regexp_replace\(lower\(v_def\),'\[\[:space:\]\]'\s*,\s*''\s*,\s*'g'\)/);
  assert.match(migration,/onconflict\(agency,tracking_code\)donothing/);
});

test("target identity is additive and native uniqueness is preserved",()=>{
  for(const token of ["parcel_id uuid","default gen_random_uuid()","set not null","forwarding_id uuid null","on delete restrict","primary key(parcel_id)","where forwarding_id is null","where forwarding_id is not null"]) assert.ok(migration.toLowerCase().includes(token),token);
  assert.doesNotMatch(migration,/alter policy|create policy|drop policy/i);
});

test("all eight identified functions are covered without public signature changes",()=>{
  for(const name of ["begin_paid_destination_orchestration","confirm_parcel_delivery","finalize_paid_destination_orchestration","reconcile_initial_physical_inventory","confirm_klz_lshi_departure","record_detailed_arrival","record_forwarding_arrival","confirm_forwarding_delivery"]) assert.ok(migration.includes(name),name);
  assert.doesNotMatch(migration,/drop function/i);
});

test("normal flows resolve only native parcels while forwarding uses explicit UUID",()=>{
  for(const token of ["forwarding_id is null for update","where forwarding_id=v_forwarding.forwarding_id for update","where parcel_id=v_parcel.parcel_id","v_forwarding.original_tracking_code"]) assert.ok(migration.includes(token),token);
  assert.doesNotMatch(migration,/tracking_code\s*=\s*v_forwarding\.forwarding_reference,v_forwarding\.destination_agency/i);
});

test("rollback refuses collisions and never deletes parcels",()=>{
  assert.match(rollback,/ROLLBACK_REFUSED_FORWARDING_PARCELS_EXIST/);
  assert.match(rollback,/ROLLBACK_REFUSED_IDENTITY_COLLISIONS_EXIST/);
  assert.doesNotMatch(rollback,/truncate\s+public\.stockage_parcels|drop\s+table\s+public\.stockage_parcels/i);
});

test("UI identity helper preserves B C D and only labels forwarded context",()=>{
  for(const suffix of ["B","C","D"]){
    const code=`AT19326${suffix}`;
    assert.ok(helper.includes("trackingCode"));
    assert.equal(code,code);
  }
  assert.match(helper,/\$\{parcel\.trackingCode\} · \$\{origin\}-\$\{destination\}/);
  assert.match(helper,/candidates\.length === 1/);
});

const normalFlows=["recherche colis normal","Encaissement destination normal","paiement COO","paiement destination","sortie automatique après paiement total","arrivée manuelle","remise","consultation Stockage","historique","statistiques","lecture Admin","lecture Agent","suffixe B","suffixe C","suffixe D"];
for(const flow of normalFlows)test(`avant/après identique: ${flow}`,()=>{
  const suffix=flow.endsWith(" B")?"B":flow.endsWith(" C")?"C":flow.endsWith(" D")?"D":"";
  const native={parcelId:"11111111-1111-4111-8111-111111111111",agency:"FIH",trackingCode:`AT19326${suffix}`,forwardingId:null};
  assert.equal(selectStorageParcel([native]),native);
  assert.equal(hasStorageParcelCollision([native]),false);
  assert.equal(storageParcelDisplayCode(native),native.trackingCode);
  assert.match(migration,/forwarding_id is null/);
  assert.doesNotMatch(migration,/cash_accounts\s+set|cash_events\s+set|tarif|rate_usd_per_kg\s*:=/i);
});

test("forwarding collision keeps two UUID identities and an explicit display context",()=>{
  const native={parcelId:"11111111-1111-4111-8111-111111111111",agency:"FIH",trackingCode:"AT19326B",forwardingId:null};
  const forwarded={parcelId:"22222222-2222-4222-8222-222222222222",agency:"FIH",trackingCode:"AT19326B",forwardingId:"33333333-3333-4333-8333-333333333333",originAgency:"KLZ",destinationAgency:"FIH"};
  assert.notEqual(native.parcelId,forwarded.parcelId);
  assert.equal(native.trackingCode,forwarded.trackingCode);
  assert.equal(native.forwardingId,null);
  assert.equal(`${forwarded.trackingCode} · ${forwarded.originAgency}-${forwarded.destinationAgency}`,"AT19326B · KLZ-FIH");
  assert.equal(hasStorageParcelCollision([native,forwarded]),true);
  assert.equal(selectStorageParcel([native,forwarded]),null);
  assert.equal(selectStorageParcel([native,forwarded],forwarded.parcelId),forwarded);
  assert.equal(storageParcelDisplayCode(native),"AT19326B");
  assert.equal(storageParcelDisplayCode(forwarded),"AT19326B · KLZ-FIH");
});
