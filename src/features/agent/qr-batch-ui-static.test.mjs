import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./qr-association-page.tsx", import.meta.url), "utf8");
const batch = readFileSync(new URL("./qr-batch-association.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/agent/qr/batch-prevalidate/route.ts", import.meta.url), "utf8");
const assignRoute = readFileSync(new URL("../../app/api/agent/qr/assign/route.ts", import.meta.url), "utf8");

test("conserve le mode simple et ajoute le mode série uniquement derrière la garde COO", () => {
  assert.match(page, /Mode simple/);
  assert.match(page, /Association en série/);
  assert.ok(page.indexOf("profile.site !== \"COO\"") < page.indexOf("<QrBatchAssociation"));
});

test("prévisualise chaque ligne et exige une confirmation explicite", () => {
  for (const label of ["N° QR", "qrId", "Destination", "Code colis", "État QR", "MANIFESTE", "Doublon", "Résultat"]) {
    assert.match(batch, new RegExp(label));
  }
  assert.match(batch, /Je confirme explicitement/);
  assert.match(batch, /Confirmer les associations valides/);
});

test("réutilise la mutation officielle avec un requestId par ligne", () => {
  assert.match(batch, /for \(const line of readyLines\)/);
  assert.match(batch, /const requestId = createQrAssignmentRequestId\(\)/);
  assert.match(batch, /submitQrAssociation/);
  assert.match(assignRoute, /certifyQrParcelIdentity/);
  assert.match(assignRoute, /assignQrLabelInternally/);
  assert.doesNotMatch(batch, /payment|stockage|caisse|depense|transfert/i);
});

test("la prévalidation serveur refuse les Agents hors COO et ne mute rien", () => {
  assert.match(route, /auth\.identity\.site !== "COO"/);
  assert.match(route, /QR_AGENCY_ACCESS_DENIED/);
  assert.doesNotMatch(route, /assignQrLabelInternally|assign_qr_label_server/);
});
