import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
function loadCashSource() {
  const cache = new Map();
  function load(request, parent = process.cwd()) {
    if (request === "server-only") return {};
    if (request === "@supabase/supabase-js") return { createClient: () => { throw new Error("TEST_NETWORK_FORBIDDEN"); } };
    if (!request.startsWith("@/") && !request.startsWith(".")) return nativeRequire(request);
    const filename = request.startsWith("@/") ? path.resolve("src", `${request.slice(2)}.ts`) : path.resolve(parent, `${request}.ts`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} }; cache.set(filename, mod);
    new Function("require", "module", "exports", compiled)((name) => load(name, path.dirname(filename)), mod, mod.exports);
    return mod.exports;
  }
  return load("@/server/cash-dashboard-source").CashDashboardSource;
}

function fixture() {
  const agencies = ["FIH", "LSHI", "KLZ"];
  const events = [
    ...agencies.map((agency, index) => ({ event_id: `opening-${agency}`, agency, event_type: "OPENING_BALANCE_RECORDED", business_date: "2026-09-01", direction: "CREDIT", amount: [100, 50, 10][index] })),
    { event_id: "fih-prior", agency: "FIH", event_type: "PAYMENT_CREDIT_RECORDED", business_date: "2026-09-22", direction: "CREDIT", amount: 40 },
    { event_id: "lshi-prior", agency: "LSHI", event_type: "PAYMENT_CREDIT_RECORDED", business_date: "2026-09-22", direction: "CREDIT", amount: 10 }
  ];
  const rows = {
    cash_accounts: agencies.map((agency) => ({ agency, status: "ACTIVE" })),
    cash_events: events,
    cash_current_day: [
      { agency: "FIH", business_date: "2026-09-22", payments_total: 40, expenses_total: 0, corrections_net: 0 },
      { agency: "LSHI", business_date: "2026-09-22", payments_total: 10, expenses_total: 0, corrections_net: 0 },
      { agency: "FIH", business_date: "2026-09-23", payments_total: 30, expenses_total: 5, corrections_net: -2 },
      { agency: "LSHI", business_date: "2026-09-23", payments_total: 30, expenses_total: 5, corrections_net: -2 },
      { agency: "KLZ", business_date: "2026-09-23", payments_total: 20, expenses_total: 4, corrections_net: 0 }
    ],
    cash_agency_totals: agencies.map((agency) => ({ agency, business_date: "2026-09-23", payment_count: 1, payments_total: agency === "KLZ" ? 20 : 30, expenses_total: agency === "KLZ" ? 4 : 5 })),
    cash_daily_closures: [{ closure_id: "lshi-close", agency: "LSHI", business_date: "2026-09-22", opening_balance: 50, payments_total: 10, expenses_total: 0, corrections_net: 0, closing_balance: 60, status: "CLOSED", version: 1, closed_at: "2026-09-22T22:00:00Z", reopened_at: null }],
    cash_agent_payment_details: [], cash_anomalies: [], cash_coo_revenue_outside_cash: [], cash_admin_audit: []
  };
  const currentEvents = [
    ["FIH", "PAYMENT_CREDIT_RECORDED", "CREDIT", 30], ["FIH", "EXPENSE_DEBIT_RECORDED", "DEBIT", 5], ["FIH", "ADMIN_ADJUSTMENT_RECORDED", "DEBIT", 2],
    ["LSHI", "PAYMENT_CREDIT_RECORDED", "CREDIT", 30], ["LSHI", "EXPENSE_DEBIT_RECORDED", "DEBIT", 5], ["LSHI", "ADMIN_ADJUSTMENT_RECORDED", "DEBIT", 2],
    ["KLZ", "PAYMENT_CREDIT_RECORDED", "CREDIT", 20], ["KLZ", "EXPENSE_DEBIT_RECORDED", "DEBIT", 4]
  ];
  currentEvents.forEach(([agency, event_type, direction, amount], index) => events.push({ event_id: `current-${index}`, agency, event_type, business_date: "2026-09-23", direction, amount }));
  return rows;
}

function fakeClient(rows, calls) {
  return { schema: () => ({ from: (table) => ({ select: () => {
    calls.push(table);
    let selected = [...(rows[table] ?? [])];
    const query = {
      eq(column, value) { selected = selected.filter((row) => row[column] === value); return query; },
      lt(column, value) { selected = selected.filter((row) => String(row[column]) < String(value)); return query; },
      lte(column, value) { selected = selected.filter((row) => String(row[column]) <= String(value)); return query; },
      order(column, options = {}) { selected.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (options.ascending === false ? -1 : 1)); return query; },
      limit(count) { selected = selected.slice(0, count); return query; },
      range(from, to) { return Promise.resolve({ data: selected.slice(from, to + 1), error: null }); },
      then(resolve) { return Promise.resolve({ data: selected, error: null }).then(resolve); }
    };
    return query;
  } }) }) };
}

test("Direction et Admin ont les mêmes soldes, avec 6 lectures contre au moins 26", async () => {
  const CashDashboardSource = loadCashSource();
  const rows = fixture();
  const adminCalls = [], directionCalls = [];
  const admin = await new CashDashboardSource(fakeClient(rows, adminCalls)).readAdmin("2026-09-23");
  const direction = await new CashDashboardSource(fakeClient(rows, directionCalls)).readDirectionBalances("2026-09-23");
  for (const agency of ["FIH", "LSHI", "KLZ"]) {
    const prior = admin.agencies.find((row) => row.agency === agency);
    assert.equal(direction[agency].openingBalance, prior.openingBalance);
    assert.equal(direction[agency].currentBalance, prior.currentBalance);
  }
  assert.deepEqual(direction, {
    FIH: { openingBalance: 140, currentBalance: 163 },
    LSHI: { openingBalance: 60, currentBalance: 83 },
    KLZ: { openingBalance: 10, currentBalance: 26 }
  });
  assert.equal(adminCalls.length, 26);
  assert.equal(directionCalls.length, 6);
  assert.equal(directionCalls.includes("cash_admin_audit"), false);
  assert.equal(directionCalls.includes("cash_agent_payment_details"), false);
  assert.equal(directionCalls.includes("cash_agency_totals"), false);
});
