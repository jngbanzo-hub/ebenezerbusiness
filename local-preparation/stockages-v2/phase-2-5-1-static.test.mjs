import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const stockUi = read("src/features/stockages/stockages-v2-page.tsx");
const paymentsUi = read("src/features/agent/agent-workspace.tsx");
const actionRoute = read("src/app/api/agent/stockages/payment-action/route.ts");
const routing = read("src/server/inter-agency-routing.ts");

test("l’accueil Stockages expose uniquement trois cartes vers des pages dédiées", () => {
  for (const path of ["src/app/agent/stockages/arrivages/page.tsx", "src/app/agent/stockages/sorties/page.tsx", "src/app/agent/stockages/statistiques/page.tsx"]) assert.equal(existsSync(new URL(path, root)), true);
  assert.match(stockUi, /ARRIVAGES/); assert.match(stockUi, /SORTIES/); assert.match(stockUi, /STATISTIQUES/);
  assert.match(stockUi, /AgentStockagesArrivalsPage/); assert.match(stockUi, /AgentStockagesOutputsPage/); assert.match(stockUi, /AgentStockagesStatisticsPage/);
});

test("Encaissements commence par une recherche sans files générales", () => {
  assert.match(paymentsUi, /Rechercher un colis/);
  assert.doesNotMatch(paymentsUi, /AgentEncaissementQueues|COLIS À ENCAISSER.*COLIS AVEC SOLDE RESTANT/s);
  assert.match(paymentsUi, /parcelStatus\(parcel, parcelAction\)/);
});

test("la situation physique et financière est déterminée côté serveur", () => {
  assert.match(actionRoute, /authorizeAgentRequest\(request\)/);
  assert.match(actionRoute, /requireStorageAgency\(auth\.identity\.site\)/);
  assert.doesNotMatch(actionRoute, /body\.(agency|eventId|version|agency_scope)/);
});

test("les tarifs et références inter-agences restent exclusivement serveur", () => {
  assert.match(routing, /"FIH-LSHI": 13/); assert.match(routing, /"KLZ-LSHI": 13/);
  assert.match(routing, /return `\$\{code\}-\$\{origin\}-\$\{destination\}`/);
  assert.doesNotMatch(paymentsUi, /"FIH-LSHI": 12|"LSHI-FIH": 13/);
});

test("Transferts reste isolé", () => { assert.doesNotMatch(stockUi + paymentsUi + actionRoute + routing, /features\/transferts|api\/agent\/transferts|TRANSFER_/i); });
