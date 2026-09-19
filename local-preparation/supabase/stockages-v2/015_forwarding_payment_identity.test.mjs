import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("./015_forwarding_payment_identity.sql",import.meta.url),"utf8");
const rollback=fs.readFileSync(new URL("./015_forwarding_payment_identity.rollback.sql",import.meta.url),"utf8");

test("native and forwarding exits use separate immutable identities",()=>{
  assert.match(sql,/stockage_events_native_delivery_unique[\s\S]*on public\.stockage_events\(agency,tracking_code\)[\s\S]*source_type<>'INTER_AGENCY_FORWARDING'/);
  assert.match(sql,/stockage_events_forwarding_delivery_unique[\s\S]*on public\.stockage_events\(source_request_id\)[\s\S]*source_type='INTER_AGENCY_FORWARDING'/);
});
test("forwarding payment binds both certified ids and exact parcel updates",()=>{
  assert.match(sql,/add column parcel_id uuid/);
  assert.match(sql,/add column forwarding_id uuid/);
  assert.match(sql,/where parcel_id=v_row\.parcel_id and forwarding_id=v_row\.forwarding_id/);
  assert.match(sql,/source_request_id[\s\S]*v_row\.forwarding_id::text/);
});
test("normal payment RPCs remain untouched and rollback is guarded",()=>{
  assert.doesNotMatch(sql,/create or replace function public\.begin_paid_destination_orchestration/);
  assert.doesNotMatch(sql,/create or replace function public\.finalize_paid_destination_orchestration/);
  assert.match(rollback,/ROLLBACK_BLOCKED: FORWARDING_PAYMENT_IDENTITY_ALREADY_USED/);
  assert.match(rollback,/create unique index stockage_events_delivery_unique/);
});
