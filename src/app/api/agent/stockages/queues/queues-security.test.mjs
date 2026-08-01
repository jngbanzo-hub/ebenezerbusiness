import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentRoute = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../../../admin/stockages/v2/queues/route.ts", import.meta.url), "utf8");
const source = readFileSync(new URL("../../../../../server/stockages-work-queues.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../../../../../features/stockages/stockages-v2-page.tsx", import.meta.url), "utf8");

test("les routes dérivent les droits et l’agence côté serveur", () => {
  assert.match(agentRoute, /authorizeAgentRequest\(request\)/);
  assert.match(agentRoute, /requireStorageAgency\(auth\.identity\.site\)/);
  assert.match(adminRoute, /authorizeAdminRequest\(request\)/);
  assert.doesNotMatch(agentRoute, /searchParams\.get\("agency"\)/);
});

test("les files sont en lecture seule et ne copient aucun paiement", () => {
  assert.doesNotMatch(agentRoute + adminRoute + source, /\.insert\(|\.update\(|\.delete\(|cash_events|TRANSFER/);
  assert.match(source, /readAdminPayments/);
  assert.match(source, /readCanonicalPaymentManifestRows/);
  assert.match(source, /GOOGLE_SHEETS_PAYMENTS_SOURCE_SPREADSHEET_ID|readCanonicalPaymentManifestRows/);
  assert.match(source, /EXCLUDED_HISTORICAL/);
  assert.match(source, /EXCLUDED_WRONG_AGENCY/);
  assert.match(adminRoute, /readAdminWorkQueue/);
});

test("l’interface sépare les files fiables, les vérifications et aucun Request ID visible", () => {
  for (const title of ["COLIS PRÊTS À REMETTRE", "COLIS AVEC SOLDE RESTANT", "VÉRIFICATION NÉCESSAIRE", "LIVRAISONS RÉCENTES", "RECHERCHER UN AUTRE COLIS"]) assert.match(ui, new RegExp(title));
  assert.doesNotMatch(ui, /label=["']Request ID|>Request ID</);
  assert.match(ui, /\/agent\/encaissement\?code=/);
});

test("l’interface Stockages utilise les couleurs officielles sans bouton bleu principal", () => {
  assert.match(ui, /bg-lime-400/);
  assert.match(ui, /text-amber-300/);
  assert.match(ui, /disabled:bg-slate-800/);
  assert.match(ui, /focus-visible:ring-lime-300/);
  assert.doesNotMatch(ui, /Vérifier dans Encaissements<\/Button>/);
  assert.doesNotMatch(ui, /(?:bg|text|border)-blue-/);
  assert.match(ui, /Audit source/);
});
