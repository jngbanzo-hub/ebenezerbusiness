import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260908120000_qr_admin_activity_batch_read.sql", "utf8");
const service = readFileSync("src/server/admin-recent-activity.ts", "utf8");

test("une agrégation QR Admin remplace le N+1 sans écriture", () => {
  assert.match(service, /read_qr_admin_activity_batch_server/);
  assert.doesNotMatch(service, /readAdminQr|assignments\.map/);
  assert.match(migration, /join public\.qr_labels label on label\.qr_id = audit\.qr_id/i);
  assert.match(migration, /label\.status = 'ASSIGNED'/i);
  assert.match(migration, /audit\.occurred_at >= p_since/i);
  assert.doesNotMatch(migration, /\binsert\b|\bupdate\b|\bdelete\b/i);
});

test("le RPC batch reste réservé au service et vérifie l'Admin actif", () => {
  assert.match(migration, /actif is true/i);
  assert.match(migration, /upper\(btrim\(role\)\) = 'ADMIN'/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /grant execute on function public\.read_qr_admin_activity_batch_server\(uuid, timestamptz\)[\s\S]*to service_role/i);
  assert.match(migration, /revoke all on function public\.read_qr_admin_activity_batch_server\(uuid, timestamptz\)[\s\S]*from public, anon, authenticated, service_role/i);
});
