import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("./qr-assignment-history.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/agent/qr/assignment-history/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../features/agent/qr-association-page.tsx", import.meta.url), "utf8");
const stock = readFileSync(new URL("../features/qr-label/qr-stock-summary.tsx", import.meta.url), "utf8");

test("l'historique COO lit toutes les associations initiales officielles", () => {
  assert.match(service, /\.from\("qr_audit_events"\)/);
  assert.match(service, /\.eq\("action", "INITIAL_ASSIGNMENT"\)/);
  assert.doesNotMatch(service, /\.eq\("actor_agency"/);
  assert.match(service, /\.from\("qr_labels"\)/);
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("la route reste réservée à COO et sans cache", () => {
  assert.match(route, /authorizeAgentRequest/);
  assert.match(route, /identity\.site !== "COO"/);
  assert.match(route, /private, no-store, max-age=0/);
});

test("le stock et l'historique sont relus après association", () => {
  assert.match(page, /setQrDataRevision\(\(value\) => value \+ 1\)/);
  assert.match(page, /refreshKey=\{qrDataRevision\}/);
  assert.match(page, /refreshManifestCandidates\(\)/);
  assert.match(stock, /setInterval\(\(\) => void load\(\), 30_000\)/);
  assert.doesNotMatch(stock, /unassigned\s*[-+]\s*1|assigned\s*[-+]\s*1/);
});
