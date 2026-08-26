import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("./agent-workspace.tsx", import.meta.url),
  "utf8"
);

test("affiche le code canonique retourné avant le montant payé", () => {
  const code = workspace.indexOf("`Code enregistré : ${result.codeColis}`");
  const amount = workspace.indexOf("`Montant payé : ${formatAmount(result.montantPaye)}`");

  assert.ok(code >= 0);
  assert.ok(amount > code);
});

test("n'ajoute aucune normalisation UI susceptible de retirer B, C, D ou KLZ", () => {
  assert.doesNotMatch(
    workspace,
    /Code enregistré[^\n]+(?:replace|slice|substring|split)/
  );
});
