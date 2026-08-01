import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const ui = read("../../src/features/stockages/stockages-v2-page.tsx");
const workspace = read("../../src/features/agent/agent-workspace.tsx");
const route = read("../../src/app/api/agent/inter-agency-routing/quote/route.ts");
const routing = read("../../src/server/inter-agency-routing.ts");
const arrival = read("../supabase/stockages-v2/008_stockage_detailed_arrivals.sql");
const paymentEdge = read("../edge-functions/web-hardened/paiements-agents-enregistrer-paiement/index.ts");

test("Stockages affiche uniquement les soldes et statistiques physiques", () => {
  assert.match(ui, /Statistiques physiques/);
  assert.match(ui, /Colis entrés/); assert.match(ui, /Kg sortis/);
  assert.doesNotMatch(ui, /<AgentWorkQueues accountActive=\{data\.actionsEnabled\}/);
  assert.match(workspace, /<AgentEncaissementQueues/);
});

test("le devis inter-agences est authentifié et calculé côté serveur", () => {
  assert.match(route, /authorizeAgentRequest\(request\)/);
  assert.match(route, /requireStorageAgency\(auth\.identity\.site\)/);
  assert.match(routing, /INTER_AGENCY_RATES/);
  assert.match(routing, /amountExpectedUsd: round\(input\.weightKg \* rateUsdPerKg\)/);
  assert.doesNotMatch(workspace, /FIH-LSHI.*12|LSHI-FIH.*13/);
});

test("l’arrivage détaillé est idempotent, transactionnel et serveur uniquement", () => {
  assert.match(arrival, /record_detailed_arrival/);
  assert.match(arrival, /where request_id=p_request_id/);
  assert.match(arrival, /for update/);
  assert.match(arrival, /DUPLICATE_ARRIVAL_PARCEL/);
  assert.match(arrival, /revoke all.*public,anon,authenticated/s);
  assert.match(arrival, /grant execute.*service_role/s);
  assert.doesNotMatch(arrival, /delete from public\.stockage_events|truncate/i);
});

test("la Caisse reçoit un type de paiement sans dépendre du Stockage", () => {
  assert.match(paymentEdge, /paymentType: publicPayment\.statutPaiement === "SOLDE" \? "SOLDE" : "FRET"/);
  assert.doesNotMatch(paymentEdge, /stockage_events|stockage_accounts/);
});

test("Transferts reste absent du workflow", () => {
  assert.doesNotMatch(ui + workspace + route + routing + arrival, /transferts|TRANSFER_/i);
});
