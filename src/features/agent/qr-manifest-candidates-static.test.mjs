import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../../server/qr-manifest-candidates.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/agent/qr/manifest-candidates/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("./qr-association-page.tsx", import.meta.url), "utf8");
const batch = readFileSync(new URL("./qr-batch-association.tsx", import.meta.url), "utf8");

test("la lecture MANIFESTE est réservée à COO et strictement sans écriture", () => {
  assert.match(route, /auth\.identity\.site !== "COO"/);
  assert.match(route, /readManifestQrCandidates/);
  assert.match(service, /FIH|MANIFEST_SITES/);
  assert.match(service, /readAdminManifestRange\(`\$\{agency\}!A:H`\)/);
  assert.doesNotMatch(`${service}\n${route}`, /\.insert\(|\.update\(|\.delete\(|method:\s*["']POST|assign_qr_label_server/);
});

test("le panneau charge seulement les lignes prêtes dans le batch existant", () => {
  assert.match(page, /Nouveaux QR à associer/);
  assert.match(page, /Charger dans Association en série/);
  assert.match(page, /manifestCandidates\.filter\(\(line\) => line\.ready\)/);
  assert.match(page, /setMode\("batch"\)/);
  assert.match(page, /<QrBatchAssociation initialInput=\{batchInput\}/);
  assert.match(batch, /Prévalider la série/);
  assert.match(batch, /Je confirme explicitement/);
});
