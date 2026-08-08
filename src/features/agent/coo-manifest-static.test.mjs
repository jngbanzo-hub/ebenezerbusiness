import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("./agent-dashboard.tsx", import.meta.url), "utf8");
const manifest = readFileSync(new URL("./agent-manifest-page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/agent/manifest/route.ts", import.meta.url), "utf8");

test("COO voit uniquement Encaissement Dépenses Manifeste Transferts et Rapport COO", () => {
  assert.match(dashboard, /profile\.agence === "COTONOU" && operation\.key === "stockage"/);
  assert.match(dashboard, /href: "\/agent\/manifeste"/);
  assert.match(dashboard, /\["caisse", "rapport-journalier"\]\.includes\(operation\.key\)/);
  assert.match(dashboard, /key: "rapport-coo"/);
  assert.doesNotMatch(dashboard, /CooDepositAgentAction/);
  assert.doesNotMatch(dashboard, /canAccessCooDepositAction/);
});

test("le module COO est strictement en lecture seule et sépare FIH LSHI KLZ", () => {
  assert.match(manifest, /\["FIH", "LSHI", "KLZ"\]/);
  assert.match(manifest, /MANIFESTE PUBLIC — CONSULTATION EN LECTURE SEULE/);
  assert.doesNotMatch(manifest, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
});

test("le serveur impose les destinations autorisées pour COO", () => {
  assert.match(route, /viewerAgency === "COO"/);
  assert.match(route, /cooModule && viewerAgency !== "COO"/);
  assert.match(route, /\["FIH", "LSHI", "KLZ"\]\.includes\(requestedAgency\)/);
  assert.match(route, /compareStorage: viewerAgency !== "COO"/);
});
