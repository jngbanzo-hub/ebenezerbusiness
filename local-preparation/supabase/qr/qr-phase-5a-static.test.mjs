import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const route = readFileSync(new URL("src/app/api/agent/qr/assign/route.ts", root), "utf8");
const certifier = readFileSync(new URL("src/server/qr-identity-certifier.ts", root), "utf8");
const mutation = readFileSync(new URL("src/server/qr-assignment-service.ts", root), "utf8");
const sql = readFileSync(new URL("local-preparation/supabase/qr/003_qr_server_initial_assignment.sql", root), "utf8");
const batch = readFileSync(new URL("local-preparation/supabase/qr/PHASE_5A_BATCH_CONTRACT.md", root), "utf8");

test("la route certifie avant toute mutation interne", () => {
  assert.ok(route.indexOf("certifyQrParcelIdentity(") < route.indexOf("assignQrLabelInternally({"));
  assert.match(route, /\.strict\(\)/);
  assert.match(route, /Boolean\(value\.qrId\) !== Boolean\(value\.displayNumber\)/);
});

test("le certificateur réutilise uniquement la recherche MANIFEST officielle", () => {
  assert.match(certifier, /paiements-agents-rechercher-colis/);
  assert.match(certifier, /destinationCode: input\.agency/);
  assert.match(certifier, /codeColis: input\.trackingCode/);
  assert.doesNotMatch(certifier, /Stockage|stockages|enregistrer-paiement/);
});

test("le navigateur ne reçoit ni service_role ni RPC de mutation", () => {
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|assign_qr_label_server/);
  assert.match(mutation, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(mutation, /assign_qr_label_server/);
});

test("la mutation initiale reste service-only et audite atomiquement", () => {
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /'INITIAL_ASSIGNMENT'/);
  assert.match(sql, /insert into public\.qr_audit_events[\s\S]*update public\.qr_labels/i);
  assert.match(sql, /a\.actif is true/);
  assert.match(sql, /upper\(btrim\(a\.role\)\) in \('AGENT', 'ADMIN'\)/);
});

test("les droits agence et les codes complets restent stricts", () => {
  assert.match(sql, /v_actor\.actor_agency not in \('COO', v_agency\)/);
  assert.match(sql, /normalize_qr_tracking_code\(v_agency, p_tracking_code, 'BUSINESS'\)/);
  assert.doesNotMatch(sql, /regexp_replace|right\(|substring\(/i);
});

test("aucun moteur interdit n'est importé", () => {
  const combined = [route, certifier, mutation, sql].join("\n");
  assert.doesNotMatch(combined, /destination-payment|encaissements-|stockages-v2|cash-|enregistrer-paiement/i);
});

test("le futur batch exige une identité explicite et indépendante par ligne", () => {
  assert.match(batch, /"displayNumber"/);
  assert.match(batch, /"agency"/);
  assert.match(batch, /"trackingCode"/);
  assert.match(batch, /association atomique par ligne/);
  assert.match(batch, /aucune\s+règle « ligne suivante = QR suivant »/i);
  assert.match(batch, /Aucun endpoint batch n'est\s+activé/);
});
