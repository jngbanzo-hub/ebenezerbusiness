import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "./bilan-test-context";
import { monthPeriod } from "./cohort-catalog";
import { TEST_COHORTS } from "./bilan-test-context";
import { parseBilanApiQuery } from "./bilan-api-query";
import { buildBilanFilterQuery as buildQuery, createBilanFilters as createFilters, createBilanRequestGuard, type BilanFilters } from "./bilan-filter-state";
const createBilanFilters = (prefix: string) => createFilters(prefix, TEST_COHORTS);
const buildBilanFilterQuery = (filters: BilanFilters) => buildQuery(filters, TEST_COHORTS);

const parse = (query: string) => parseBilanApiQuery(`https://example.test/api/admin/bilan?${query}`);

test("une seule source de cohortes, partagée avec l’interface", () => {
  const ui = readFileSync("src/features/admin/bilan/admin-bilan-page.tsx", "utf8");
  assert.match(ui, /loadOriginMonths\(session.access_token\)/);
  assert.match(ui, /definitions.map/);
});

for (const [prefix, month, last] of [["JL", "07", "31"], ["AT", "08", "31"], ["SE", "09", "30"]]) {
  test(`${prefix} déduit exactement 2026-${month}, avec ou sans dates explicites`, () => {
    const implicit = parse(`cohort=${prefix}`);
    const explicit = parse(buildBilanFilterQuery(createBilanFilters(prefix)));
    assert.deepEqual(implicit, explicit);
    assert.equal(explicit.state, "VALID");
    if (explicit.state === "VALID") assert.deepEqual(explicit.query.period, { from: `2026-${month}-01`, to: `2026-${month}-${last}` });
  });
}

test("AT → SE → AT efface les anciennes dates personnalisées", () => {
  let filters = { ...createBilanFilters("AT"), mode: "CUSTOM" as const, from: "2026-08-10", to: "2026-08-20" };
  assert.equal(parse(buildBilanFilterQuery(filters)).state, "VALID");
  for (const prefix of ["SE", "AT"]) {
    const next = createBilanFilters(prefix);
    assert.equal(next.mode, "MONTH");
    assert.deepEqual(parse(buildBilanFilterQuery(next)), parse(`cohort=${prefix}`));
    filters = { ...next, mode: "CUSTOM" };
  }
  assert.equal(filters.from, "2026-08-01");
  assert.equal(filters.to, "2026-08-31");
});

test("mode mensuel dérivé, même si les dates personnalisées en mémoire sont anciennes", () => {
  const filters = { ...createBilanFilters("SE"), from: "2026-08-01", to: "2026-08-31" };
  assert.deepEqual(parse(buildBilanFilterQuery(filters)), parse("cohort=SE"));
});

for (const query of [
  "cohort=AT&startDate=2026-09-01&endDate=2026-09-30",
  "cohort=SE&startDate=2026-08-01&endDate=2026-08-31",
  "cohort=AT&startDate=2026-08-10&endDate=2026-08-20",
  "cohort=AT&periodMode=CUSTOM&startDate=2026-08-20&endDate=2026-09-05",
  "cohort=AT&periodMode=CUSTOM&startDate=2026-09-01&endDate=2026-09-10",
  "cohort=AT&periodMode=CUSTOM&startDate=2026-07-31&endDate=2026-08-10",
  "cohort=AT&periodMode=CUSTOM&startDate=2026-08-20&endDate=2026-08-10",
  "cohort=AT&periodMode=CUSTOM&startDate=2026-08-01&endDate=2026-08-32",
  "cohort=AT&periodMode=CUSTOM", "cohort=AT&periodMode=UNKNOWN", "cohort=AT&cohort=SE"
]) test(`refus explicite : ${query}`, () => assert.equal(parse(query).state, "INVALID"));

for (const [from, to] of [["2026-08-10", "2026-08-20"], ["2026-08-01", "2026-08-31"]]) {
  test(`plage personnalisée interne acceptée : ${from} → ${to}`, () => {
    const query = buildBilanFilterQuery({ ...createBilanFilters("AT"), mode: "CUSTOM", from, to });
    const parsed = parse(query);
    assert.equal(parsed.state, "VALID");
    if (parsed.state === "VALID") assert.deepEqual(parsed.query.period, { from, to });
  });
}

test("le client refuse aussi les dates hors mois avant la requête", () => {
  assert.throws(() => buildBilanFilterQuery({ ...createBilanFilters("AT"), mode: "CUSTOM", to: "2026-09-01" }), /mois d’origine/);
  assert.throws(() => createBilanFilters("XX"), /NON RÉSOLUE/);
  assert.equal(parse("cohort=XX").state, "COHORTE_NON_RESOLUE");
});

test("calendrier UTC : années bissextiles sans décalage de fuseau", () => {
  assert.equal(monthPeriod(2028, 2).to, "2028-02-29");
  assert.equal(monthPeriod(2027, 2).to, "2027-02-28");
});

test("réponse AT tardive, erreur et finally obsolètes ne remplacent pas SE", async () => {
  const guard = createBilanRequestGuard();
  let displayed: string | null = "ancien résultat";
  let loading = false;
  let error = "";
  const deferred = () => {
    let resolve!: (value: string) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const run = async (promise: Promise<string>) => {
    const request = guard.begin(); loading = true;
    try { const value = await promise; if (request.isCurrent()) displayed = value; }
    catch { if (request.isCurrent()) error = "erreur"; }
    finally { if (request.isCurrent()) loading = false; }
  };
  const old = deferred(); const oldTask = run(old.promise);
  guard.invalidate(); displayed = null;
  assert.equal(displayed, null);
  const latest = deferred(); const latestTask = run(latest.promise);
  old.resolve("AT"); await oldTask;
  assert.equal(displayed, null); assert.equal(loading, true);
  latest.resolve("SE"); await latestTask;
  assert.equal(displayed, "SE"); assert.equal(loading, false);
  const staleError = deferred(); const errorTask = run(staleError.promise);
  guard.invalidate();
  const next = deferred(); const nextTask = run(next.promise);
  next.resolve("AT"); await nextTask;
  staleError.reject(new Error("late")); await errorTask;
  assert.equal(displayed, "AT"); assert.equal(error, "");
});

test("annulation au changement de filtre et au démontage", () => {
  const guard = createBilanRequestGuard();
  const first = guard.begin(); const second = guard.begin();
  assert.equal(first.signal.aborted, true); assert.equal(first.isCurrent(), false);
  guard.invalidate(); assert.equal(second.signal.aborted, true); assert.equal(second.isCurrent(), false);
});

test("le composant raccorde invalidation, effacement, bornes et garde de réponse", () => {
  const ui = readFileSync("src/features/admin/bilan/admin-bilan-page.tsx", "utf8");
  assert.match(ui, /changeFilters\(createBilanFilters\(event.target.value, definitions\)\)/);
  assert.match(ui, /requests.current.invalidate\(\);\s*setData\(null\)/);
  assert.match(ui, /if \(!request.isCurrent\(\)\) return/);
  assert.match(ui, /return \(\) => guard.invalidate\(\)/);
  assert.match(ui, /min=\{bounds.from\} max=\{bounds.to\}/);
  assert.match(ui, /Analyse personnalisée — mois d’origine/);
  assert.doesNotMatch(ui, /periodMonth|setPeriodMonth|type="month"/);
});
