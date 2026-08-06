import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const workspace = read("src/features/agent/agent-workspace.tsx");
const route = read("src/app/api/agent/inter-agency-routing/quote/route.ts");
const routing = read("src/server/inter-agency-routing.ts");
const errors = read("src/server/stockages-forwarding-errors.ts");

test("la feuille recherchée est l’origine et l’agence authentifiée est la destination", () => {
  assert.match(route, /origin:\s*requireStorageAgency\(url\.searchParams\.get\("sourceAgency"\)/);
  assert.match(route, /const destination = requireStorageAgency\(auth\.identity\.site\)/);
  assert.match(route, /destination\s*\n/);
  assert.match(routing, /row\.sourceSite === input\.origin/);
  assert.match(workspace, /new URLSearchParams\(\{ trackingCode, sourceAgency \}\)/);
  assert.doesNotMatch(route, /url\.searchParams\.get\("destination"\)/);
});

test("le navigateur ne transmet ni destination, ni poids, ni tarif, ni montant au devis", () => {
  assert.doesNotMatch(workspace, /URLSearchParams\(\{[^}]*destination/);
  assert.doesNotMatch(workspace, /URLSearchParams\(\{[^}]*(weight|rate|amount)/i);
  assert.doesNotMatch(route, /searchParams\.get\("(weight|rate|amount)/i);
});

test("la commande préparatoire conserve la même direction autoritaire", () => {
  const commandRoute = read("src/app/api/agent/stockages/forwardings/route.ts");
  assert.match(commandRoute, /origin:\s*requireStorageAgency\(String\(body\.sourceAgency/);
  assert.match(commandRoute, /destination:\s*requireStorageAgency\(auth\.identity\.site\)/);
  assert.doesNotMatch(commandRoute, /body\.destination/);
});

test("les erreurs conservent leur code métier et leur statut HTTP", () => {
  assert.match(route, /error instanceof StockagesV2Error/);
  assert.match(route, /fail\(error\.code, error\.status\)/);
  for (const code of ["INVALID_INTER_AGENCY_ROUTE", "STORAGE_AGENCY_NOT_SUPPORTED", "INVALID_TRACKING_CODE", "TRACKING_CODE_NOT_FOUND", "SOURCE_AGENCY_MISMATCH", "AGENT_SERVICE_UNAVAILABLE"]) {
    assert.ok((route + errors).includes(code));
  }
  assert.match(workspace, /payload\?\.code.*HTTP_\$\{response\.status\}/s);
  assert.doesNotMatch(route, /L’acheminement ne peut pas être préparé/);
});

test("une seule recherche active et une seule réponse courante peuvent modifier l’interface", () => {
  assert.match(workspace, /searchLockRef\.current/);
  assert.match(workspace, /activeSearchIdRef\.current/);
  assert.match(workspace, /if \(searchLockRef\.current\) return/);
  assert.match(workspace, /searchId !== activeSearchIdRef\.current/);
});

test("un échec de devis retire le colis source et empêche le formulaire normal", () => {
  assert.match(workspace, /const quote = await loadInterAgencyQuote[\s\S]*setRoutingQuote\(quote\)[\s\S]*catch \(error\) \{\s*setParcel\(null\)/);
});

test("le succès affiche uniquement les données propres à l’acheminement", () => {
  for (const label of ["Acheminement inter-agences", "Origine", "Destination", "Code original", "Poids", "Tarif", "Montant attendu", "Référence"]) {
    assert.ok(workspace.includes(label));
  }
  assert.match(workspace, /routingQuote \? \([\s\S]*Code original[\s\S]*\) : \([\s\S]*Déjà payé/);
});

test("Transferts demeure absent du devis et de son interface", () => {
  assert.doesNotMatch(workspace + route + routing, /features\/transferts|api\/agent\/transferts|TRANSFER_/i);
});
