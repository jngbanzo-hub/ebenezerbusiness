import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("local-preparation/supabase/notifications/001_internal_notifications.sql", "utf8");
const api = readFileSync("src/app/api/notifications/route.ts", "utf8");
const service = readFileSync("src/server/internal-notifications.ts", "utf8");
const profile = readFileSync("src/features/agent/agent-profile-page.tsx", "utf8");
const system = readFileSync("src/features/admin/admin-system-status.tsx", "utf8");

test("notifications idempotentes et lectures propres à chaque utilisateur", () => {
  assert.match(migration, /event_key text not null unique/i);
  assert.match(migration, /primary key \(notification_id, user_id\)/i);
  assert.match(service, /ignoreDuplicates: true/);
});

test("RLS et routes limitent Agent à son agence et Admin à toutes", () => {
  assert.match(migration, /upper\(trim\(a\.role\)\) = 'ADMIN'/i);
  assert.match(migration, /internal_notifications\.agency/i);
  assert.match(api, /authorizeAdminRequest/);
  assert.match(api, /authorizeAgentRequest/);
  assert.match(service, /query = query\.eq\("agency", requiredAgency\(scope\.agency\)\)/);
});

test("profil Agent reste en lecture seule et l’état Admin vient des sources officielles", () => {
  assert.doesNotMatch(profile, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.match(profile, /Agence, rôle, statut et identifiant sont protégés/);
  assert.match(system, /sources Caisse et Stockage officielles/);
  assert.match(system, /NON APPLICABLE/);
});

test("COO ne reçoit pas de notification Caisse ou Stockage par les routes concernées", () => {
  const arrival = readFileSync("src/app/api/agent/stockages/arrival/route.ts", "utf8");
  const delivery = readFileSync("src/app/api/agent/stockages/delivery/route.ts", "utf8");
  assert.match(arrival, /requireStorageAgency/);
  assert.match(delivery, /requireStorageAgency/);
  assert.doesNotMatch(arrival + delivery, /agency:\s*["']COO["']/);
});
