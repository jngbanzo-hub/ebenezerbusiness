import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper = await readFile(
  new URL("../src/server/transferts-admin-field-correction.ts", import.meta.url),
  "utf8"
);
const appsClient = await readFile(
  new URL("../src/features/transferts/api.ts", import.meta.url),
  "utf8"
);
const adminDetails = await readFile(
  new URL("../src/features/transferts/admin-transfer-details.tsx", import.meta.url),
  "utf8"
);
const agentDetails = await readFile(
  new URL("../src/features/transferts/agent-transfer-details.tsx", import.meta.url),
  "utf8"
);
const amountRoute = await readFile(
  new URL("../src/app/api/admin/transferts/[transferId]/correct-amount/route.ts", import.meta.url),
  "utf8"
);
const beneficiaryRoute = await readFile(
  new URL("../src/app/api/admin/transferts/[transferId]/correct-beneficiary/route.ts", import.meta.url),
  "utf8"
);

test("les deux corrections sont exclusivement des commandes POST Admin", () => {
  for (const route of [amountRoute, beneficiaryRoute]) {
    assert.ok(route.includes("export async function POST"));
    assert.equal(/export async function (GET|PUT|PATCH|DELETE)/.test(route), false);
    assert.ok(route.includes("correctTransferFieldAsAdmin"));
  }
  assert.ok(helper.includes("await authorizeAdminRequest(request)"));
  assert.ok(helper.includes("!flags.adminEnabled || !flags.writesEnabled"));
});

test("les états terminaux et un retrait restent protégés", () => {
  assert.ok(helper.includes("assertCorrectionAllowed"));
  assert.ok(helper.includes("assertCorrectionAllowed(transfer)"));
});

test("le montant est strictement validé contre les frais existants", () => {
  assert.ok(helper.includes("Number.isFinite(amount)"));
  assert.ok(helper.includes("amount <= 0"));
  assert.ok(helper.includes("input.newAmount! < transfer.fees"));
  assert.ok(appsClient.includes("correctAdminTransferAmount"));
  assert.ok(adminDetails.includes("Les frais restent inchangés."));
});

test("le bénéficiaire seul est envoyé par la commande dédiée", () => {
  assert.ok(helper.includes('const allowed = new Set([valueKey, "correctionRequestId"])'));
  assert.ok(helper.includes("newBeneficiaryName"));
  assert.ok(appsClient.includes("correctAdminTransferBeneficiary"));
});

test("chaque formulaire génère une clé de correction et ne déclenche aucune notification", () => {
  assert.ok(adminDetails.includes("correctionRequestId"));
  assert.ok(adminDetails.includes("crypto.randomUUID()"));
  assert.equal(helper.includes("notify"), false);
  assert.equal(adminDetails.includes("notify"), false);
});

test("l’observation existante reste visible et en lecture seule dans le détail Agent", () => {
  assert.ok(agentDetails.includes('label="Observation"'));
  assert.ok(agentDetails.includes("transfer.observation"));
  assert.equal(agentDetails.includes('name="observation"'), false);
});
