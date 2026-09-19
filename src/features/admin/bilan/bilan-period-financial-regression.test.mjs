import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

// Execute the real before/after Bilan services. Only external data readers are
// replaced by synthetic fixtures; no credentials, network or business writes.
const directory = path.resolve("src/features/admin/bilan");
const auditedBaseline = "79af018e43a85846e9e3058360730a619e21ad53";
const agencies = ["FIH", "LSHI", "KLZ"];
const cohorts = [["JL", 7], ["AT", 8], ["SE", 9]];
const code = (prefix, index) => `${prefix}${101 + index}26`;
const date = (month, day = "01") => `2026-${String(month).padStart(2, "0")}-${day}`;
const manifests = Object.fromEntries(agencies.map((agency, index) => [agency,
  cohorts.map(([prefix, month]) => [date(month), code(prefix, index), "Synthétique", "Synthétique", index + 2, (index + 2) * (index + 9)])
]));
const shipments = cohorts.flatMap(([prefix, month]) => agencies.map((agency, index) => [
  date(month + 1), "DHL", agency, 1, index + 2, `GROUPAGE ${month * 10 + index}\n${code(prefix, index)} : ${index + 2}kgs`
]));
const freight = shipments.filter(row => row[2] !== "KLZ").map(row => [...row, 2, row[4] * 2]);
const payments = cohorts.flatMap(([prefix, month]) => agencies.map((agency, index) => ({
  id: `${agency}:${month}`, paymentRequestId: `synthetic-${prefix}-${agency}`, codeColis: code(prefix, index),
  dateTime: `${date(month + 1)}T12:00:00Z`, montantAttendu: (index + 2) * (index + 9),
  montantPaye: (index + 2) * (index + 9), destinationCode: agency, agenceEncaissement: agency, statutPaiement: "SOLDÉ"
})));
const expenses = cohorts.flatMap(([, month]) => ["COO", ...agencies].flatMap((agency, index) => ["Transport", "TF Bénin"].map(category => ({
  id: `expense-${month}-${agency}-${category}`, date: date(month, "15"), agence: agency, categorie: category,
  montant: month * 10 + index, devise: "USD", description: "Synthétique", reference: "TEST",
  statut: "VALIDÉ", annulee: false, corrigee: false
}))));

function loadVersion(baseline) {
  const cache = new Map();
  const readRange = async range => {
    if (range.startsWith("EXPÉDITION!")) return shipments;
    if (range.includes("STATISTIQUES DES EXPÉDITIONS")) return freight;
    const agency = range.split("!")[0];
    assert.ok(agency in manifests, `Unknown fixture range ${range}`);
    return manifests[agency];
  };
  const stubs = {
    "server-only": {},
    "@/server/admin-manifest-sheets": { readCanonicalManifestRange: readRange, readAdminManifestRange: readRange },
    "@/server/admin-payments-sheets": { readAdminPayments: async () => payments },
    "@/server/agent-expenses-apps-script": { readAdminExpenses: async () => ({ depenses: expenses, pagination: { totalPages: 1 } }) },
    "./monthly-bonus-reader": { readMonthlyAgentBonuses: async monthOrigin => ["COO", ...agencies].map(agency => ({
      id: `bonus-${agency}`, monthOrigin, agency, amountUsd: 10, status: "CERTIFIEE", agentId: `synthetic-${agency}`, agentName: "Synthétique"
    })) }
  };
  function load(request, parent = directory) {
    if (request === "node:async_hooks") return createRequire(import.meta.url)(request);
    if (Object.hasOwn(stubs, request)) return stubs[request];
    assert.ok(request.startsWith("./"), `External import forbidden: ${request}`);
    const filename = path.resolve(parent, `${request}.ts`);
    assert.equal(path.dirname(filename), directory);
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = baseline
      ? execFileSync("git", ["show", `${auditedBaseline}:${path.relative(process.cwd(), filename)}`], { encoding: "utf8" })
      : readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} }; cache.set(filename, mod);
    new Function("require", "module", "exports", compiled)(req => load(req, path.dirname(filename)), mod, mod.exports);
    return mod.exports;
  }
  const sql = readFileSync("local-preparation/supabase/bilan/024_bilan_origin_months.sql", "utf8");
  const definitions = [...sql.matchAll(/\('([A-Z]+)',(\d{4}),(\d{1,2}),'([^']+)'\)/g)].map(([,prefix,year,month,label])=>({prefix,year:Number(year),month:Number(month),label,id:`${year}-${month.padStart(2,"0")}`}));
  const withRegistry = run => baseline ? run() : load("./cohort-registry").withBilanCohorts(definitions, run);
  return { parse: url => withRegistry(()=>load("./bilan-api-query").parseBilanApiQuery(url)), build: (query,admin) => withRegistry(()=>load("./bilan-service").buildAdminBilan(query,admin)) };
}

test("services Bilan avant/après : résultats strictement identiques pour JL, AT, SE et plage interne", async () => {
  const before = loadVersion(true), after = loadVersion(false);
  const admin = { authorized: true, userId: "synthetic-admin", agency: "COO", email: "test@example.invalid", role: "ADMIN" };
  for (const [prefix, month] of cohorts) {
    for (const custom of [false, true]) {
      const from = date(month, custom ? "10" : "01");
      const to = custom ? date(month, "20") : new Date(Date.UTC(2026, month, 0)).toISOString().slice(0, 10);
      const url = `https://example.test/api/admin/bilan?cohort=${prefix}&startDate=${from}&endDate=${to}`;
      const oldQuery = before.parse(url), newQuery = after.parse(url + (custom ? "&periodMode=CUSTOM" : ""));
      assert.equal(oldQuery.state, "VALID"); assert.equal(newQuery.state, "VALID");
      assert.deepEqual(newQuery.query, oldQuery.query);
      const oldResult = await before.build(oldQuery.query, admin), newResult = await after.build(newQuery.query, admin);
      // Only the technical calculation timestamp is intentionally ignored.
      const comparable = payload => ({ ...payload, meta: { ...payload.meta, calculatedAt: "IGNORED_TIMESTAMP" } });
      assert.deepEqual(comparable(newResult), comparable(oldResult));
      assert.equal(newResult.payments.receivedAmount, 92); // Payments in the following month still belong to the cohort.
      assert.equal(newResult.shipment.certifiedShippedWeightKg, 9);
      assert.ok(newResult.airFreight.laterMonthUsd > 0);
      assert.ok(newResult.directCosts.totalAllocatedUsd > 0);
      assert.equal(newResult.fixedCosts.totalUsd, 2390);
      assert.ok(newResult.treasury.tfBeninByCurrency.USD > 0);
      assert.ok(newResult.periodExpenses.deductibleByCurrency.USD > 0);
    }
  }
});
