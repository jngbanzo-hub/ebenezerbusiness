import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/server/transferts-write-validation.ts", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(
  source.replace(/import type \{[\s\S]*?\} from "@\/features\/transferts\/types";/, ""),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
).outputText;
const validation = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const baseInput = {
  agencyTo: "COO",
  amount: 100,
  currency: "USD",
  fees: 2,
  service: "RIA",
  transferCode: "SECRET-123",
  senderName: "Alice",
  beneficiaryName: "Bob",
  beneficiaryPhone: "+22900000000",
  transferRequestId: "123e4567-e89b-42d3-a456-426614174000"
};

test("les six circuits autorisés sont acceptés et les circuits latéraux refusés", () => {
  for (const [from, to] of [
    ["FIH", "COO"], ["LSHI", "COO"], ["KLZ", "COO"],
    ["COO", "FIH"], ["COO", "LSHI"], ["COO", "KLZ"]
  ]) {
    assert.doesNotThrow(() => validation.assertCircuit(from, to));
  }
  for (const [from, to] of [["FIH", "FIH"], ["COO", "COO"], ["FIH", "LSHI"], ["KLZ", "FIH"]]) {
    assert.throws(() => validation.assertCircuit(from, to), validation.TransferValidationError);
  }
});

test("la création valide strictement les montants, frais, devise et champs obligatoires", () => {
  const valid = validation.validateCreateTransferInput(baseInput, "FIH");
  assert.equal(valid.agencyFrom, "FIH");
  assert.equal(valid.transferCode, "SECRET-123");
  for (const amount of [0, -1, Infinity, "100"]) {
    assert.throws(() => validation.validateCreateTransferInput({ ...baseInput, amount }, "FIH"));
  }
  for (const fees of [-1, 101, Infinity]) {
    assert.throws(() => validation.validateCreateTransferInput({ ...baseInput, fees }, "FIH"));
  }
  for (const mutation of [
    { currency: "EUR" },
    { beneficiaryPhone: "" },
    { service: "" },
    { transferCode: "" },
    { transferCode: "<script>" },
    { transferRequestId: "not-uuid" },
    { actorAgency: "COO" }
  ]) {
    assert.throws(() => validation.validateCreateTransferInput({ ...baseInput, ...mutation }, "FIH"));
  }
});

function transfer(status, from = "FIH", to = "COO") {
  return { transferId: "id", status, agencyFrom: from, agencyTo: to };
}

test("réception et retrait sont réservés au bénéficiaire", () => {
  assert.doesNotThrow(() => validation.assertAgentMayPerformTransferAction("CONFIRM_CODE_RECEIVED", transfer("ENVOYE"), "COO"));
  assert.throws(() => validation.assertAgentMayPerformTransferAction("CONFIRM_CODE_RECEIVED", transfer("ENVOYE"), "FIH"));
  assert.doesNotThrow(() => validation.assertAgentMayPerformTransferAction("CONFIRM_FUNDS_WITHDRAWN", transfer("CODE_RECU"), "COO"));
  assert.throws(() => validation.assertAgentMayPerformTransferAction("CONFIRM_FUNDS_WITHDRAWN", transfer("CODE_RECU"), "FIH"));
});

test("confirmation finale, signalement et annulation suivent la machine d’états", () => {
  for (const agency of ["FIH", "COO"]) {
    assert.doesNotThrow(() => validation.assertAgentMayPerformTransferAction("CONFIRM_TRANSFER", transfer("FONDS_RETIRES"), agency));
    assert.doesNotThrow(() => validation.assertAgentMayPerformTransferAction("FLAG_FOR_REVIEW", transfer("CODE_RECU"), agency));
    assert.doesNotThrow(() => validation.assertAgentMayPerformTransferAction("CANCEL_TRANSFER", transfer("A_VERIFIER"), agency));
  }
  assert.throws(() => validation.assertAgentMayPerformTransferAction("CANCEL_TRANSFER", transfer("FONDS_RETIRES"), "COO"));
  assert.throws(() => validation.assertAgentMayPerformTransferAction("FLAG_FOR_REVIEW", transfer("A_VERIFIER"), "COO"));
  assert.throws(() => validation.assertAgentMayPerformTransferAction("CONFIRM_TRANSFER", transfer("CONFIRME"), "COO"));
  assert.throws(() => validation.assertAgentMayPerformTransferAction("CANCEL_TRANSFER", transfer("ENVOYE"), "LSHI"));
});

test("les payloads de transition rejettent les champs d’identité injectés", () => {
  assert.deepEqual(validation.validateTransitionBody({}, false), {});
  assert.deepEqual(validation.validateTransitionBody({ motif: "Erreur de référence" }, true), { motif: "Erreur de référence" });
  assert.throws(() => validation.validateTransitionBody({ agency: "COO" }, false));
  assert.throws(() => validation.validateTransitionBody({ motif: "" }, true));
});
