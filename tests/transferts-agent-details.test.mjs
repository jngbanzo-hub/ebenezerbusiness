import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../src/app/api/agent/transferts/[transferId]/route.ts", import.meta.url),
  "utf8"
);
const page = await readFile(
  new URL("../src/features/transferts/agent-transferts-page.tsx", import.meta.url),
  "utf8"
);
const details = await readFile(
  new URL("../src/features/transferts/agent-transfer-details.tsx", import.meta.url),
  "utf8"
);
const adminDetails = await readFile(
  new URL("../src/features/transferts/admin-transfer-details.tsx", import.meta.url),
  "utf8"
);

test("la route Agent effectue un second contrôle des deux agences", () => {
  assert.ok(route.includes("allowAgentDetailCode: true"));
  assert.ok(route.includes("transfer.agencyFrom !== identity.site"));
  assert.ok(route.includes("transfer.agencyTo !== identity.site"));
  assert.ok(route.includes('"FORBIDDEN"'));
  assert.ok(route.indexOf("await callTransfertsReadApi") < route.indexOf("transfer.agencyFrom !== identity.site"));
});

test("la liste reste compacte, métier et exclusivement masquée", () => {
  for (const value of [
    "Transfer ID", "agencyFrom", "agencyTo", "senderName",
    "beneficiaryName", "amount", "currency", "maskedCode", "status", "sentAt"
  ]) assert.ok(page.includes(value));
  assert.ok(page.includes("Voir les détails"));
  assert.equal(page.includes("transfer.transferCode"), false);
});

test("le détail Agent affiche toutes les informations et masque le code par défaut", () => {
  for (const label of [
    "Transfer ID", "Agence expéditrice", "Agence bénéficiaire", "Expéditeur",
    "Bénéficiaire", "Téléphone bénéficiaire", "Service", "Montant", "Frais",
    "Observation", "Statut", "Date et heure", "Chronologie"
  ]) assert.ok(details.includes(label));
  assert.ok(details.includes("useState(false)"));
  assert.ok(details.includes("Afficher le code"));
  assert.ok(details.includes("Masquer le code"));
  assert.ok(details.includes("setTransfer(null)"));
  assert.equal(details.includes("localStorage"), false);
  assert.equal(details.includes("sessionStorage"), false);
  assert.equal(details.includes("console."), false);
});

test("aucune correction n’est proposée dans l’espace Agent", () => {
  assert.equal(page.includes("Corriger le code"), false);
  assert.equal(details.includes("Corriger le code"), false);
  assert.ok(adminDetails.includes("Corriger le code"));
});
