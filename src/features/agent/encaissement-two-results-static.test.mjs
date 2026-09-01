import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("./agent-workspace.tsx", import.meta.url), "utf8");
const functions = readFileSync(new URL("./functions.ts", import.meta.url), "utf8");

test("une recherche destination interroge Stockage V2 et le MANIFESTE en parallèle", () => {
  assert.match(workspace, /Promise\.allSettled\(\[\s*searchDestinationParcel\(normalizedCode, requestedParcelId\),\s*searchAgentManifestControl\(canonicalRequestedCode\)/);
  assert.match(functions, /new URLSearchParams\(\{ trackingCode \}\)/);
  assert.match(functions, /\/api\/agent\/encaissements\/parcel\?\$\{params\}/);
  assert.match(functions, /\/api\/agent\/manifest\?\$\{params\}/);
});

test("affiche les deux résultats avec leurs responsabilités séparées", () => {
  assert.match(workspace, /Encaissement \/ Stockage V2/);
  assert.match(workspace, /Source opérationnelle pour l’admissibilité à l’encaissement/);
  assert.match(workspace, /Vérification MANIFESTE PUBLIC/);
  assert.match(workspace, /Information de contrôle uniquement — ne décide pas de l’encaissement/);
  assert.match(workspace, /n’est pas présent dans le Stockage de votre agence et n’est pas encaissable actuellement/);
});

test("retire seulement le contrôle MANIFESTE autonome permanent", () => {
  assert.doesNotMatch(workspace, /import \{ AgentManifestControl \}/);
  assert.doesNotMatch(workspace, /<AgentManifestControl/);
});

test("conserve le scanner et les chemins de paiement existants", () => {
  assert.match(workspace, /EncaissementQrScanner/);
  assert.match(workspace, /savePayment/);
  assert.match(workspace, /saveDestinationPayment/);
  assert.doesNotMatch(workspace, /assign_qr_label_server|INITIAL_ASSIGNMENT/);
});

test("le scanner résout le QR puis réutilise strictement la recherche existante", () => {
  assert.match(workspace, /resolveQrById\(getSupabaseBrowserClient\(\)\.auth, qrId\)/);
  assert.match(workspace, /runEncaissementSearch\(candidate\.trackingCode, candidate\.agency\)/);
  assert.match(workspace, /runEncaissementSearch\(codeColis, sourceAgency\)/);
  assert.doesNotMatch(workspace, /QR_RESOLVER_INACTIVE_MESSAGE|service d’association QR n’est pas encore activé/);
});

test("traite les états QR sans lancer de paiement", () => {
  assert.match(workspace, /candidate\.status === "UNASSIGNED"/);
  assert.match(workspace, /association au colis en attente/);
  assert.match(workspace, /candidate\.status === "REVOKED"/);
  assert.match(workspace, /QR inconnu\/non reconnu/);
  const qrHandler = workspace.slice(workspace.indexOf("async function handleQrRead"), workspace.indexOf("async function handlePayment"));
  assert.doesNotMatch(qrHandler, /savePayment|saveDestinationPayment/);
});
