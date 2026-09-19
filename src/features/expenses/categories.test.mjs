import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./categories.ts", import.meta.url), "utf8");
const canonical = readFileSync(
  new URL("../../../local-preparation/apps-script/expenses/canonical/Code.gs", import.meta.url),
  "utf8"
);

const categories = [
  "Aéroport", "Expédition FIH", "Expédition LSHI", "Expédition KLZ",
  "Expédition LKS", "Déclarant", "Manutention", "Barrière", "Entrepôt",
  "Transport", "Crédit", "Connexion", "Pasteur Sera", "Ma Vanela",
  "Pasteur Jacques", "TF Bénin", "TF LSHI", "TF FIH", "Frais d’envoi",
  "Frais de retrait", "Commission clients", "Scotch", "Sacs", "Loyer",
  "Eau", "Électricité", "Filmage", "Poubelle", "Chauffeur", "Salaire",
  "Prime", "Dette", "Impression", "Autres"
];

test("la liste partagée reproduit exactement les catégories canoniques Dépenses", () => {
  for (const category of categories) {
    assert.ok(source.includes(JSON.stringify(category)), `catégorie partagée manquante: ${category}`);
    assert.ok(canonical.includes(`'${category}'`) || canonical.includes(`"${category}"`), `catégorie Apps Script manquante: ${category}`);
  }
  assert.equal(new Set(categories).size, 34);
  assert.doesNotMatch(source, /TF Benin/);
});
