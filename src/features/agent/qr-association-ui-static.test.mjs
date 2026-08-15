import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("./qr-association-page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("./qr-association-client.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./agent-dashboard.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/agent/qr/resolve/route.ts", import.meta.url), "utf8");

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

test("utilise seulement les routes serveur avec la session existante", () => {
  assert.match(client, /authenticatedRead/);
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
