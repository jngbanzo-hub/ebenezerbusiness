import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./qr-association-page.tsx", import.meta.url), "utf8");
const batch = readFileSync(new URL("./qr-batch-association.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/agent/qr/batch-prevalidate/route.ts", import.meta.url), "utf8");
const assignRoute = readFileSync(new URL("../../app/api/agent/qr/assign/route.ts", import.meta.url), "utf8");
const batchAssignRoute = readFileSync(new URL("../../app/api/agent/qr/batch-assign/route.ts", import.meta.url), "utf8");
const batchAssignService = readFileSync(new URL("../../server/qr-batch-assignment-service.ts", import.meta.url), "utf8");

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
  assert.ok(batch.indexOf("Je confirme explicitement") < batch.indexOf("Correspondances QR → colis"));
  assert.match(batch, /\{readyCount \? <section/);
  assert.match(batch, /disabled=\{busy \|\| !confirmed\}/);
  assert.match(batch, /Prévalidation en cours…/);
});

test("met en évidence un QR déjà utilisé avec sa destination et son code actuels", () => {
  assert.match(batch, /QR DÉJÀ UTILISÉ/);
  assert.match(batch, /line\.currentAgency/);
  assert.match(batch, /line\.currentTrackingCode/);
  assert.match(batch, /line\.result === "QR_ALREADY_ASSIGNED"/);
});

test("groupe la confirmation finale avec un requestId stable par ligne", () => {
  assert.match(batch, /line\.requestId \?\? createQrAssignmentRequestId\(\)/);
  assert.match(batch, /submitQrBatchAssociation/);
  assert.match(batch, /Association en cours…/);
  assert.match(batch, /ASSOCIATIONS RÉUSSIES/);
  for (const label of ["ASSOCIÉS", "DÉJÀ ASSOCIÉS", "EN ERREUR", "NON TRAITÉS"]) assert.match(batch, new RegExp(label));
  assert.match(batch, /aria-live="polite"/);
  assert.match(batchAssignRoute, /auth\.identity\.site !== "COO"/);
  assert.match(batchAssignService, /assignQrLabelInternally/);
  assert.match(batchAssignService, /mapWithConcurrency\(commands, 4/);
  assert.match(batchAssignService, /readCanonicalManifestIdentities/);
  assert.match(assignRoute, /certifyQrParcelIdentity/);
  assert.match(assignRoute, /assignQrLabelInternally/);
  assert.doesNotMatch(batch, /payment|stockage|caisse|depense|transfert/i);
});

test("la prévalidation serveur refuse les Agents hors COO et ne mute rien", () => {
  assert.match(route, /auth\.identity\.site !== "COO"/);
  assert.match(route, /QR_AGENCY_ACCESS_DENIED/);
  assert.doesNotMatch(route, /assignQrLabelInternally|assign_qr_label_server/);
});
