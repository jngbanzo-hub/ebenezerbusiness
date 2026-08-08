import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("./agent-dashboard.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("./agent-workspace.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./coo-report-page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/agent/coo-report/route.ts", import.meta.url), "utf8");

test("COO voit Rapport COO et les autres agences conservent leurs modules", () => {
  assert.match(dashboard, /key: "rapport-coo"/);
  assert.match(dashboard, /operation\.key !== "rapport-coo"/);
  assert.match(dashboard, /href: "\/agent\/rapport-coo"/);
});

test("le contrôle Manifeste redondant est masqué uniquement pour COO", () => {
  assert.match(workspace, /profile\.agence !== "COTONOU" \? <AgentManifestControl/);
  assert.match(workspace, /searchParcel/);
  assert.match(workspace, /savePayment/);
});

test("le rapport COO est en lecture seule, sans Caisse et réservé à COO", () => {
  assert.match(route, /authorization\.identity\.site !== "COO"/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.match(page, /Recettes COO hors caisse/);
  assert.match(page, /Aucune Caisse COO n’existe/);
  assert.doesNotMatch(page, /solde initial|solde actuel|clôture de Caisse/i);
});
