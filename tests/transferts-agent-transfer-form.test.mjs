import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const form = await readFile(
  new URL("../src/features/transferts/agent-transfer-form.tsx", import.meta.url),
  "utf8"
);

test("le formulaire capture une référence sûre avant le premier await", () => {
  const capture = form.indexOf("const formElement = event.currentTarget");
  const firstAwait = form.indexOf("await createAgentTransfer");
  assert.ok(capture >= 0 && capture < firstAwait);
  assert.equal(form.slice(firstAwait).includes("event.currentTarget"), false);
});

test("reset, nouveau UUID, succès et actualisation suivent uniquement la réussite", () => {
  const call = form.indexOf("await createAgentTransfer");
  const reset = form.indexOf("formElement.reset()", call);
  const newId = form.indexOf("setTransferRequestId(crypto.randomUUID())", reset);
  const success = form.indexOf("Transfert créé avec succès.", newId);
  const refresh = form.indexOf("onSuccess()", success);
  const caught = form.indexOf("} catch", refresh);
  assert.ok(call < reset && reset < newId && newId < success && success < refresh && refresh < caught);
  assert.equal(form.slice(caught).includes("formElement.reset()"), false);
  assert.equal(form.slice(caught).includes("setTransferRequestId(crypto.randomUUID())"), false);
});

test("Eye et EyeOff ne changent que la visibilité de la saisie", () => {
  assert.ok(form.includes("Eye, EyeOff"));
  assert.ok(form.includes('type={showTransferCode ? "text" : "password"}'));
  assert.ok(form.includes('type="button"'));
  assert.equal(form.includes("console."), false);
});

test("le téléphone bénéficiaire est explicitement facultatif", () => {
  assert.match(form, /Téléphone bénéficiaire \(facultatif\)/);
  const field = form.match(/<input name="beneficiaryPhone"[^>]+>/)?.[0] ?? "";
  assert.ok(field);
  assert.doesNotMatch(field, /\brequired\b/);
});
