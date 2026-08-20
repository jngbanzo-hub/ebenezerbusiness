import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("./qr-association-page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("./qr-association-client.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./agent-dashboard.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/agent/qr/resolve/route.ts", import.meta.url), "utf8");
const assignRoute = readFileSync(new URL("../../app/api/agent/qr/assign/route.ts", import.meta.url), "utf8");
const cooGuard = readFileSync(new URL("../../../local-preparation/supabase/qr/005_qr_initial_assignment_coo_only.sql", import.meta.url), "utf8");

test("ajoute une opération Agent dédiée hors Encaissements", () => {
  assert.match(dashboard, /title: "Associer un QR"/);
  assert.match(dashboard, /href: "\/agent\/qr-association"/);
  assert.doesNotMatch(component, /agent-workspace|encaissement-qr-scanner/);
});

test("prévalide avant d’exposer la confirmation humaine", () => {
  assert.match(component, /handlePrevalidate/);
  assert.match(component, /status !== "UNASSIGNED"/);
  assert.match(component, /Confirmer l’association/);
  assert.match(component, /Annuler/);
  assert.ok(component.indexOf("setCandidate(resolved)") < component.indexOf("handleConfirm"));
});

test("affiche une alerte dédiée avec l’identité actuelle pour un QR ASSIGNED", () => {
  assert.match(component, /QR DÉJÀ UTILISÉ/);
  assert.match(component, /usedQr\.qrId/);
  assert.match(component, /usedQr\.agency/);
  assert.match(component, /usedQr\.trackingCode/);
  assert.match(component, /if \(resolved\.status === "ASSIGNED"\) setUsedQr\(resolved\)/);
});

test("ajoute une recherche rapide strictement en lecture via le résolveur Agent", () => {
  assert.match(component, /Rechercher un QR/);
  assert.match(component, /013 ou EEBQR000013/);
  assert.match(component, /resolveQrById/);
  assert.match(component, /resolveQrCandidate/);
  assert.match(component, /QR LIBRE — AUCUN COLIS ASSOCIÉ/);
  assert.match(component, /QR RÉVOQUÉ — NON UTILISABLE/);
  assert.ok(component.indexOf("Rechercher un QR") < component.indexOf("Nouveaux QR détectés dans le MANIFESTE"));
  assert.doesNotMatch(component.slice(component.indexOf("handleQrSearch"), component.indexOf("if (profile")), /submitQrAssociation|handleConfirm/);
});

test("utilise seulement les routes serveur avec la session existante", () => {
  assert.match(client, /authenticatedRead/);
  assert.match(client, /AbortController/);
  assert.match(client, /BATCH_PREVALIDATION_TIMEOUT/);
  assert.match(client, /\/api\/agent\/qr\/resolve/);
  assert.match(client, /\/api\/agent\/qr\/assign/);
  assert.doesNotMatch([component, client, route].join("\n"), /assign_qr_label_server|SUPABASE_SERVICE_ROLE_KEY/);
});

test("le formulaire ne fabrique jamais le qrId", () => {
  assert.match(component, /displayNumber: candidate\.displayNumber/);
  assert.doesNotMatch(component, /EEBQR.*padStart|"EEBQR"\s*\+/);
});

test("aucun scanner ou moteur métier interdit n’est importé", () => {
  const source = [component, client, route].join("\n");
  assert.doesNotMatch(source, /scanner|payment|stockages|caisse|depenses|transferts|google-sheets/i);
});

test("réserve l’association initiale aux Agents COO à chaque frontière", () => {
  assert.match(dashboard, /operation\.key === "qr-association"[\s\S]*profile\.agence === "COTONOU"/);
  assert.match(component, /profile\.site !== "COO"/);
  assert.match(component, /Opération réservée à COO/);
  assert.match(assignRoute, /actor\.role === "AGENT" && actor\.site !== "COO"/);
  assert.match(assignRoute, /QR_AGENCY_ACCESS_DENIED/);
  assert.match(cooGuard, /old\.status = 'UNASSIGNED' and new\.status = 'ASSIGNED'/);
  assert.match(cooGuard, /v_role = 'AGENT' and v_agency <> 'COO'/);
});
