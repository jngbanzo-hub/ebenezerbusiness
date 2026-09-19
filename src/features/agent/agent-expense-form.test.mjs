import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./agent-expense-form.tsx", import.meta.url), "utf8");

test("affiche la confirmation enrichie avec l'instantané de la soumission confirmée", () => {
  assert.match(source, /const submittedExpense = Object\.freeze/);
  assert.match(source, /text: alreadyRecorded[\s\S]*"Dépense enregistrée avec succès"/);
  assert.match(source, /expenseSuccessDetail\(submittedExpense\)/);
  assert.ok(source.indexOf("const submittedExpense") < source.indexOf('await fetch("/api/agent/expenses"'));
  assert.ok(source.indexOf("setResult({", source.indexOf("payload?.success === true")) < source.indexOf("setValues(INITIAL_VALUES)"));
});

test("protège le double clic et montre Enregistrement pendant la requête", () => {
  assert.match(source, /if \(requestLockRef\.current\) \{\s*return;/);
  assert.match(source, /requestLockRef\.current = true/);
  assert.match(source, /disabled=\{[\s\S]*isSubmitting/);
  assert.match(source, /isSubmitting[\s\S]*\? "Enregistrement…"/);
  assert.match(source, /finally \{\s*requestLockRef\.current = false;\s*setIsSubmitting\(false\)/);
});

test("ne réinitialise le formulaire qu'après un succès serveur certifié", () => {
  const success = source.indexOf("payload?.success === true");
  const reset = source.indexOf("setValues(INITIAL_VALUES)", success);
  const failure = source.indexOf("throw new Error", success);
  assert.ok(success >= 0 && reset > success && failure > reset);
  assert.doesNotMatch(source.slice(source.indexOf("} catch (error)"), source.indexOf("} finally")), /setValues\(INITIAL_VALUES\)/);
});

test("préserve les réponses idempotentes et l'avertissement Caisse existant", () => {
  assert.match(source, /DEPENSE_DEJA_ENREGISTREE/);
  assert.match(source, /Cette dépense avait déjà été enregistrée\./);
  assert.match(source, /La caisse de l’agence n’est pas encore ouverte ; aucun débit de caisse n’a été créé\./);
});
