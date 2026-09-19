import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./010_physical_inventory_reconciliation.sql", import.meta.url), "utf8");

test("la réconciliation physique est atomique, auditée et idempotente", () => {
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /PHYSICAL_INVENTORY_RECONCILIATION/);
  assert.match(sql, /PHYSICAL_INVENTORY_RECONCILED/);
  assert.match(sql, /commandFingerprint/);
  assert.match(sql, /IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /for update/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /STOCK_CORRECTION_RECORDED/);
  assert.match(sql, /target_event_id/);
  assert.match(sql, /current_parcel_count = v_count/);
  assert.match(sql, /current_weight_kg = v_weight/);
});

test("la RPC est réservée au service_role et protège les inventaires existants", () => {
  assert.match(sql, /ADMIN_REQUIRED/);
  assert.match(sql, /INVENTORY_ALREADY_MATERIALIZED/);
  assert.match(sql, /INVENTORY_HISTORY_NOT_RECONCILABLE/);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/);
});
