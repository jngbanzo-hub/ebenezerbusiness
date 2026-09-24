import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import {
  DIRECTION_EXPENSES_TODAY_TIMEOUT_MS,
  DIRECTION_SOURCE_TIMEOUT_MS,
  observeDirectionSource
} from "./direction-summary-diagnostics.ts";

const agencies = ["FIH", "LSHI", "KLZ"];

function directionFixture(readExpenses, { simulateTimeout = false } = {}) {
  const observed = [];
  const stubs = {
    "server-only": {},
    "@/server/cash-dashboard-source": {
      createServerCashDashboardSource: () => ({ readDirectionBalances: async () => Object.fromEntries(agencies.map((agency) => [agency, { openingBalance: 100, currentBalance: 100 }])) })
    },
    "@/server/agent-expenses-apps-script": {
      readAdminExpenses: async (_actor, filters) => {
        assert.equal(filters.dateDebut, "2026-09-24");
        assert.equal(filters.dateFin, "2026-09-24");
        assert.equal(filters.page, 1);
        assert.equal(filters.pageSize, 100);
        return { depenses: await readExpenses(), pagination: { totalPages: 1 } };
      }
    },
    "@/server/stockages-v2": {
      businessDatePortoNovo: () => "2026-09-24",
      readAdminStorage: async () => ({ accounts: agencies.map((agency) => ({ agency, current_parcel_count: 2, current_weight_kg: 4 })) })
    },
    "@/features/daily-report/daily-report": {
      REPORT_AGENCIES: ["COO", ...agencies],
      buildDailyAgencyReport: ({ agency, expenses }) => {
        const rows = expenses.filter((row) => row.agence === agency && !row.annulee);
        const totals = {};
        for (const row of rows) totals[row.devise] = (totals[row.devise] ?? 0) + row.montant;
        return { expenseCount: rows.length, expensesByCurrency: totals };
      }
    },
    "@/features/admin/bilan/bilan-service": { buildAdminBilan: () => { throw new Error("BENEFIT_NOT_EXPECTED"); } },
    "@/features/admin/bilan/cohort-registry": { withBilanCohorts: () => { throw new Error("BENEFIT_NOT_EXPECTED"); } },
    "@/server/bilan-origin-months": { readBilanOriginMonths: async () => [] },
    "@/server/direction-summary-scope": {
      resolveDirectionScope: (businessDate) => ({ businessDate, cohort: null, analysisPeriod: { from: businessDate, to: businessDate } })
    },
    "@/server/direction-summary-diagnostics": {
      DIRECTION_EXPENSES_TODAY_TIMEOUT_MS,
      observeDirectionSource: (source, reader, options) => {
        observed.push({ source, configuredTimeoutMs: options?.timeoutMs ?? DIRECTION_SOURCE_TIMEOUT_MS });
        return observeDirectionSource(source, reader, {
          ...options,
          timeoutMs: simulateTimeout && source === "DEPENSES" ? 5 : options?.timeoutMs,
          logger: () => {}
        });
      }
    }
  };
  const source = readFileSync(new URL("./direction-summary.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    assert.ok(Object.hasOwn(stubs, name), `Unstubbed import: ${name}`);
    return stubs[name];
  }, module, module.exports);
  return { read: () => module.exports.readDirectionSummary(new Date("2026-09-24T07:00:00Z")), observed };
}

test("Dépenses du jour : marge propre de 6 s, autres sources toujours à 4,5 s", async () => {
  assert.equal(DIRECTION_SOURCE_TIMEOUT_MS, 4_500);
  assert.equal(DIRECTION_EXPENSES_TODAY_TIMEOUT_MS, 6_000);
  const fixture = directionFixture(async () => []);
  await fixture.read();
  assert.deepEqual(fixture.observed, [
    { source: "CAISSE", configuredTimeoutMs: 4_500 },
    { source: "DEPENSES", configuredTimeoutMs: 6_000 },
    { source: "BENEFICE", configuredTimeoutMs: 4_500 },
    { source: "STOCK", configuredTimeoutMs: 4_500 }
  ]);
});

test("journée sans dépense : zéro dépense disponible, jamais INDISPONIBLE", async () => {
  const result = await directionFixture(async () => []).read();
  assert.equal(result.sources.expenses, "AVAILABLE");
  for (const agency of agencies) assert.deepEqual(result.agencies[agency].expensesToday, { status: "AVAILABLE", count: 0, byCurrency: {} });
});

test("journée avec dépenses : FIH, LSHI et KLZ gardent les montants et devises exacts", async () => {
  const rows = [
    { agence: "FIH", montant: 25, devise: "USD", annulee: false },
    { agence: "LSHI", montant: 140, devise: "USD", annulee: false },
    { agence: "KLZ", montant: 865, devise: "USD", annulee: false },
    { agence: "KLZ", montant: 5000, devise: "FCFA", annulee: false },
    { agence: "KLZ", montant: 999, devise: "USD", annulee: true }
  ];
  const result = await directionFixture(async () => rows).read();
  assert.equal(result.sources.expenses, "AVAILABLE");
  assert.deepEqual(result.agencies.FIH.expensesToday, { status: "AVAILABLE", count: 1, byCurrency: { USD: 25 } });
  assert.deepEqual(result.agencies.LSHI.expensesToday, { status: "AVAILABLE", count: 1, byCurrency: { USD: 140 } });
  assert.deepEqual(result.agencies.KLZ.expensesToday, { status: "AVAILABLE", count: 2, byCurrency: { USD: 865, FCFA: 5000 } });
  assert.deepEqual(result.totals.expensesToday.byCurrency, { USD: 1030, FCFA: 5000 });
  for (const agency of agencies) assert.equal(result.agencies[agency].cash.balance, 100);
  for (const agency of agencies) assert.equal(result.agencies[agency].stock.parcels, 2);
});

test("vraie panne Dépenses : INDISPONIBLE sans fabriquer zéro", async () => {
  const result = await directionFixture(async () => { throw new Error("SYNTHETIC_EXPENSE_FAILURE"); }).read();
  assert.equal(result.sources.expenses, "UNAVAILABLE");
  for (const agency of agencies) assert.deepEqual(result.agencies[agency].expensesToday, { status: "UNAVAILABLE", count: null, byCurrency: {} });
});

test("dépassement du nouveau délai : INDISPONIBLE sans fabriquer zéro", async () => {
  const fixture = directionFixture(() => new Promise(() => {}), { simulateTimeout: true });
  const result = await fixture.read();
  assert.equal(result.sources.expenses, "UNAVAILABLE");
  for (const agency of agencies) assert.equal(result.agencies[agency].expensesToday.count, null);
  assert.equal(fixture.observed.find((row) => row.source === "DEPENSES")?.configuredTimeoutMs, 6_000);
});
