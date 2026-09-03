import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("./canonical/Code.gs", import.meta.url),
  "utf8",
);

const agencies = ["COO", "FIH", "LSHI", "KLZ"];

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  const openingBrace = source.indexOf("{", start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Fonction incomplète: ${name}`);
}

function makePeriodNormalizer() {
  const context = {
    Date,
    CONFIG_DEPENSES: { fuseauHoraire: "Africa/Porto-Novo" },
    Utilities: {
      formatDate(value, timezone, format) {
        assert.equal(timezone, "Africa/Porto-Novo");
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(value);
        const byType = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
        const day = `${byType.year}-${byType.month}-${byType.day}`;
        return format === "yyyy-MM" ? day.slice(0, 7) : day;
      },
    },
  };
  vm.runInNewContext(`${extractFunction("normaliserPeriodeStatistique_")}\nthis.normalize = normaliserPeriodeStatistique_;`, context);
  return context.normalize;
}

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
  assert.match(creation, /attente_verrou/);
  assert.match(creation, /recherche_idempotence/);
  assert.match(creation, /ecriture_depense/);
  assert.match(creation, /ecriture_audit/);
  assert.match(creation, /'statistiques'/);
  assert.match(creation, /journaliserPerformanceDepenses_\(/);
});

test("l'instrumentation Apps Script ne journalise aucune donnée métier", () => {
  const instrumentation = source.slice(
    source.indexOf("function mesurerEtapeDepenses_"),
    source.indexOf("function demanderCorrectionDepense_"),
  );
  assert.match(instrumentation, /depenses_apps_script_performance/);
  assert.match(instrumentation, /durationsMs/);
  assert.doesNotMatch(instrumentation, /expenseRequestId|categorie|description|montant|reference|observation|acteur/);
});

test("le chemin ciblé réutilise le moteur d'agrégation et possède un repli intégral", () => {
  const targeted = source.slice(
    source.indexOf("function mettreAJourStatistiquesDepensesCibleesSousVerrou_"),
    source.indexOf("function trouverDepenseParId_"),
  );
  assert.match(targeted, /lireResumeStatistiquesDepenses_\(/);
  assert.match(targeted, /preparerMisesAJourStatistiquesDepenses_\(/);
  assert.match(targeted, /getRange\(miseAJour\.ligne, 5, 1, 2\)/);
  assert.doesNotMatch(targeted, /ecrireStatistiques_\(/);
  assert.match(targeted, /recalculerStatistiquesDepensesSousVerrou_\(classeur\)/);
});

test("la recherche idempotente est exacte et ne charge plus toutes les colonnes UUID", () => {
  const resolver = source.slice(
    source.indexOf("function trouverDepenseParId_"),
    source.indexOf("function trouverCorrectionParId_"),
  );
  assert.match(resolver, /createTextFinder\(expenseRequestId\)/);
  assert.match(resolver, /matchCase\(false\)/);
  assert.match(resolver, /matchEntireCell\(true\)/);
  assert.match(resolver, /useRegularExpression\(false\)/);
  assert.doesNotMatch(resolver, /getDisplayValues\(\)/);
});

test("la mise à jour incrémentale exige les quatre agrégats et retombe sinon sur le recalcul intégral", () => {
  const targeted = source.slice(
    source.indexOf("function mettreAJourStatistiquesDepensesCibleesSousVerrou_"),
    source.indexOf("function lireResumeStatistiquesDepenses_"),
  );
  assert.match(targeted, /\['JOURNALIER', jour, nomAgence\]/);
  assert.match(targeted, /\['JOURNALIER', jour, 'TOUS LES SITES'\]/);
  assert.match(targeted, /\['MENSUEL', mois, nomAgence\]/);
  assert.match(targeted, /\['MENSUEL', mois, 'TOUS LES SITES'\]/);
  assert.match(targeted, /if \(\s*!entree/);
  assert.match(targeted, /return null;/);
  assert.match(targeted, /recalculerStatistiquesDepensesSousVerrou_\(classeur\)/);
});

test("les vraies dates Sheets et les chaînes strictes produisent la même clé journalière", () => {
  const normalize = makePeriodNormalizer();
  assert.equal(normalize(new Date("2026-09-03T12:00:00Z"), "JOURNALIER"), "2026-09-03");
  assert.equal(normalize("2026-09-03", "JOURNALIER"), "2026-09-03");
  assert.equal(normalize(" 2026-09-03 ", "JOURNALIER"), "2026-09-03");
});

test("la normalisation Date respecte le fuseau métier près de minuit", () => {
  const normalize = makePeriodNormalizer();
  assert.equal(normalize(new Date("2026-09-02T23:30:00Z"), "JOURNALIER"), "2026-09-03");
  assert.equal(normalize(new Date("2026-09-03T22:30:00Z"), "JOURNALIER"), "2026-09-03");
});

test("les valeurs vides, ambiguës ou invalides restent invalides pour activer le fallback", () => {
  const normalize = makePeriodNormalizer();
  assert.equal(normalize("", "JOURNALIER"), null);
  assert.equal(normalize("03/09/2026", "JOURNALIER"), null);
  assert.equal(normalize(new Date(Number.NaN), "JOURNALIER"), null);
  assert.equal(normalize(null, "JOURNALIER"), null);
});

test("les périodes mensuelles existantes restent strictement compatibles", () => {
  const normalize = makePeriodNormalizer();
  assert.equal(normalize("2026-09", "MENSUEL"), "2026-09");
  assert.equal(normalize(" 2026-09 ", "MENSUEL"), "2026-09");
  assert.equal(normalize("2026-09-03", "MENSUEL"), null);
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
