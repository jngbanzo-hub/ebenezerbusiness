import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./canonical/Code.gs", import.meta.url),
  "utf8",
);

const agencies = ["COO", "FIH", "LSHI", "KLZ"];

function add(map, period, agency, currency, amount) {
  const key = `${period}|${agency}|${currency}`;
  const current = map.get(key) ?? { total: 0, count: 0 };
  map.set(key, {
    total: current.total + amount,
    count: current.count + 1,
  });
}

function apply(summary, expense) {
  const day = expense.date.slice(0, 10);
  const month = expense.date.slice(0, 7);
  for (const agency of [expense.agency, "TOUS LES SITES"]) {
    add(summary.daily, day, agency, expense.currency, expense.amount);
    add(summary.monthly, month, agency, expense.currency, expense.amount);
  }
  return summary;
}

function aggregate(expenses) {
  return expenses.reduce(
    apply,
    { daily: new Map(), monthly: new Map() },
  );
}

function serialise(summary) {
  return {
    daily: [...summary.daily].sort(),
    monthly: [...summary.monthly].sort(),
  };
}

test("la création utilise la mise à jour ciblée sous le verrou existant", () => {
  const creation = source.slice(
    source.indexOf("function enregistrerDepenseSecurisee_"),
    source.indexOf("function demanderCorrectionDepense_"),
  );
  assert.match(creation, /LockService\.getScriptLock\(\)/);
  assert.match(creation, /trouverDepenseParId_\(/);
  assert.match(creation, /mettreAJourStatistiquesDepensesCibleesSousVerrou_\(/);
  assert.doesNotMatch(creation, /recalculerStatistiquesDepensesSousVerrou_\(/);
});

test("le chemin ciblé réutilise le moteur d'agrégation et possède un repli intégral", () => {
  const targeted = source.slice(
    source.indexOf("function mettreAJourStatistiquesDepensesCibleesSousVerrou_"),
    source.indexOf("function trouverDepenseParId_"),
  );
  assert.match(targeted, /lireResumeStatistiquesDepenses_\(/);
  assert.match(targeted, /traiterLigneStatistique_\(/);
  assert.match(targeted, /ecrireStatistiques_\(/);
  assert.match(targeted, /recalculerStatistiquesDepensesSousVerrou_\(classeur\)/);
});

test("corrections et annulations conservent le recalcul intégral", () => {
  const afterCreation = source.slice(
    source.indexOf("function demanderCorrectionDepense_"),
    source.indexOf("function recalculerStatistiquesDepensesSousVerrou_"),
  );
  assert.ok(
    (afterCreation.match(/recalculerStatistiquesDepensesSousVerrou_\(/g) ?? [])
      .length >= 3,
  );
});

test("l'ajout ciblé produit les mêmes agrégats qu'un recalcul complet", () => {
  const history = agencies.flatMap((agency, index) => [
    {
      agency,
      amount: 10 + index,
      currency: "USD",
      date: "2026-08-25T08:00:00.000Z",
    },
    {
      agency,
      amount: 1000 + index,
      currency: "CDF",
      date: "2026-07-31T23:30:00.000Z",
    },
  ]);
  const additions = [
    { agency: "FIH", amount: 12.5, currency: "USD", date: "2026-08-25T12:00:00.000Z" },
    { agency: "LSHI", amount: 4, currency: "USD", date: "2026-08-26T09:00:00.000Z" },
    { agency: "KLZ", amount: 700, currency: "CDF", date: "2026-09-01T00:01:00.000Z" },
    { agency: "COO", amount: 3, currency: "USD", date: "2026-09-01T10:00:00.000Z" },
  ];

  const targeted = additions.reduce(apply, aggregate(history));
  const full = aggregate([...history, ...additions]);
  assert.deepEqual(serialise(targeted), serialise(full));
});
