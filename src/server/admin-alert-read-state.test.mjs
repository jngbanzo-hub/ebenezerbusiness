import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260817160000_admin_alert_read_states.sql", "utf8");
const route = readFileSync("src/app/api/admin/alerts/route.ts", "utf8");
const service = readFileSync("src/server/admin-alert-read-state.ts", "utf8");
const center = readFileSync("src/server/admin-alert-center.ts", "utf8");
const ui = readFileSync("src/features/admin/admin-alert-center.tsx", "utf8");
const bell = readFileSync("src/features/admin/admin-workspace.tsx", "utf8");
const conflictFix = readFileSync("supabase/migrations/20260817173000_fix_admin_alert_read_state_conflict.sql", "utf8");

test("la lecture est persistée par Admin et par identité stable", () => {
  assert.match(migration, /primary key \(admin_user_id, alert_id\)/i);
  assert.match(migration, /read_at timestamptz/i);
  assert.match(migration, /is_active boolean/i);
  assert.match(migration, /when state\.is_active then state\.occurrence else state\.occurrence \+ 1/i);
  assert.match(migration, /when state\.is_active then state\.read_at else null/i);
  assert.match(service, /sync_admin_alert_read_states_server/);
  assert.match(center, /activeAlerts\.map\(\(alert\)=>alert\.id\)/);
});

test("le compteur public de la route Admin correspond aux non lues", () => {
  assert.match(center, /count:unreadCount/);
  assert.match(center, /activeCount:alerts\.length/);
  assert.match(center, /readCount:alerts\.length-unreadCount/);
  assert.match(ui, /onCount\?\.\(value\.unreadCount\)/);
  assert.match(bell, /endpoint="\/api\/admin\/alerts"/);
});

test("l'interface conserve les alertes actives et propose Lues, Non lues et Tout marquer", () => {
  assert.match(ui, /\["TOUTES", "NON LUES", "LUES"\]/);
  assert.match(ui, /Tout marquer comme lu/);
  assert.match(ui, /item\.read \? "LUE" : "NON LUE"/);
  assert.match(ui, /alerts\.map/);
});

test("les mutations restent Admin et service-role uniquement", () => {
  assert.match(route, /authorizeAdminRequest\(request\)/g);
  assert.match(route, /MARK_READ/);
  assert.match(route, /MARK_ALL_READ/);
  assert.match(migration, /revoke all on public\.admin_alert_read_states from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.mark_admin_alerts_read_server\(uuid, text\[\]\) from public, anon, authenticated/i);
  assert.doesNotMatch(service, /stockage_parcels|payments|cash|expenses|qr_labels/i);
});

test("le RPC cible la contrainte primaire sans ambiguïté PL/pgSQL", () => {
  assert.match(conflictFix, /on conflict on constraint admin_alert_read_states_pkey do update/i);
  assert.doesNotMatch(conflictFix, /on conflict\s*\(admin_user_id,\s*alert_id\)/i);
});
