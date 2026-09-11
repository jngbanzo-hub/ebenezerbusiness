import "server-only";

import type { AdminAuthorizationResult } from "@/server/admin-authorization";
import { createServerCashDashboardSource } from "@/server/cash-dashboard-source";
import { readAdminExpenses, type AdminExpenseListResponse } from "@/server/agent-expenses-apps-script";
import { businessDatePortoNovo, readAdminStorage } from "@/server/stockages-v2";
import { buildDailyAgencyReport, REPORT_AGENCIES, type ReportAgency } from "@/features/daily-report/daily-report";
import { buildAdminBilan } from "@/features/admin/bilan/bilan-service";
import { BILAN_COHORTS } from "@/features/admin/bilan/cohort-registry";
import type { BilanApiQuery } from "@/features/admin/bilan/bilan-api-query";
import { resolveDirectionScope } from "@/server/direction-summary-scope";

const SOURCE_TIMEOUT_MS = 4_500;
const CASH_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;
const SERVICE_ACTOR: Extract<AdminAuthorizationResult, { authorized: true }> = Object.freeze({
  authorized: true,
  userId: "WHATSAPP_DIRECTION_READER",
  email: "whatsapp-direction-reader@internal.eeb",
  role: "ADMIN",
  agency: null
});

type Availability = "AVAILABLE" | "UNAVAILABLE";
type CurrencyTotals = Readonly<Record<string, number>>;
type CashValue = Readonly<{ status: Availability; balance: number | null; currency: "USD" }>;
type ExpenseValue = Readonly<{ status: Availability; count: number | null; byCurrency: CurrencyTotals }>;
type ProfitValue = Readonly<{ status: Availability; amountUsd: number | null; certification?: string }>;
type StockValue = Readonly<{ status: Availability; parcels: number | null; weightKg: number | null }>;

export type DirectionSummary = Readonly<{
  generatedAt: string;
  timezone: "Africa/Porto-Novo";
  scope: Readonly<{
    businessDate: string;
    cohort: Readonly<{ prefix: string; label: string }> | null;
    analysisPeriod: Readonly<{ from: string; to: string }>;
  }>;
  agencies: Record<ReportAgency, Readonly<{
    cash: Readonly<{ status: Availability | "NOT_APPLICABLE"; balance: number | null; currency: "USD" | null }>;
    expensesToday: Readonly<{ status: Availability; count: number | null; byCurrency: CurrencyTotals }>;
    profit: Readonly<{ status: Availability | "NOT_APPLICABLE"; amountUsd: number | null; certification?: string }>;
    stock: Readonly<{ status: Availability | "NOT_APPLICABLE"; parcels: number | null; weightKg: number | null }>;
  }>>;
  totals: Readonly<{
    expensesToday: Readonly<{ status: Availability; byCurrency: CurrencyTotals }>;
    profit: Readonly<{ status: Availability; amountUsd: number | null; source: "BILAN_FINAL_PROFIT_CONSOLIDATED"; certification?: string }>;
    stock: Readonly<{ status: Availability; parcels: number | null; weightKg: number | null }>;
  }>;
  sources: Readonly<{ cash: Availability; expenses: Availability; bilan: Availability; storageV2: Availability }>;
}>;

export async function readDirectionSummary(now = new Date()): Promise<DirectionSummary> {
  const businessDate = businessDatePortoNovo(now);
  const scope = resolveDirectionScope(businessDate, BILAN_COHORTS);
  const { cohort, analysisPeriod: period } = scope;

  const [cash, expenses, profit, storage] = await Promise.all([
    isolated(() => readCash(businessDate)),
    isolated(() => readExpenses(businessDate)),
    cohort ? isolated(() => readProfit({ cohort, period })) : Promise.resolve(null),
    isolated(readStorage)
  ]);

  const agencies = Object.fromEntries(REPORT_AGENCIES.map((agency) => [agency, Object.freeze({
    cash: agency === "COO" ? notApplicableCash() : cash?.[agency] ?? unavailableCash(),
    expensesToday: expenses?.[agency] ?? unavailableExpenses(),
    profit: agency === "COO" ? notApplicableProfit() : profit?.byAgency[agency] ?? unavailableProfit(),
    stock: agency === "COO" ? notApplicableStock() : storage?.[agency] ?? unavailableStock()
  })])) as DirectionSummary["agencies"];

  return Object.freeze({
    generatedAt: now.toISOString(),
    timezone: "Africa/Porto-Novo",
    scope: Object.freeze({ businessDate, cohort: cohort ? Object.freeze({ prefix: cohort.prefix, label: cohort.label }) : null, analysisPeriod: Object.freeze(period) }),
    agencies,
    totals: Object.freeze({
      expensesToday: expenses ? Object.freeze({ status: "AVAILABLE" as const, byCurrency: sumCurrencies(Object.values(expenses).map((item) => item.byCurrency)) }) : Object.freeze({ status: "UNAVAILABLE" as const, byCurrency: Object.freeze({}) }),
      profit: profit ? Object.freeze({ status: "AVAILABLE" as const, amountUsd: profit.consolidatedUsd, source: "BILAN_FINAL_PROFIT_CONSOLIDATED" as const, certification: profit.status }) : Object.freeze({ status: "UNAVAILABLE" as const, amountUsd: null, source: "BILAN_FINAL_PROFIT_CONSOLIDATED" as const }),
      stock: storage ? Object.freeze({ status: "AVAILABLE" as const, parcels: CASH_AGENCIES.reduce((sum, agency) => sum + storage[agency].parcels!, 0), weightKg: CASH_AGENCIES.reduce((sum, agency) => sum + storage[agency].weightKg!, 0) }) : Object.freeze({ status: "UNAVAILABLE" as const, parcels: null, weightKg: null })
    }),
    sources: Object.freeze({ cash: cash ? "AVAILABLE" : "UNAVAILABLE", expenses: expenses ? "AVAILABLE" : "UNAVAILABLE", bilan: profit ? "AVAILABLE" : "UNAVAILABLE", storageV2: storage ? "AVAILABLE" : "UNAVAILABLE" })
  });
}

async function readCash(businessDate: string) {
  const dashboard = await createServerCashDashboardSource().readAdmin(businessDate);
  return Object.fromEntries(CASH_AGENCIES.map((agency) => {
    const row = dashboard.agencies.find((item) => item.agency === agency);
    if (!row) throw new Error("CASH_AGENCY_MISSING");
    return [agency, Object.freeze({ status: "AVAILABLE" as const, balance: row.currentBalance, currency: "USD" as const })];
  })) as Record<(typeof CASH_AGENCIES)[number], CashValue>;
}

async function readExpenses(businessDate: string) {
  const rows = await readAllExpenses(businessDate);
  return Object.fromEntries(REPORT_AGENCIES.map((agency) => {
    const report = buildDailyAgencyReport({ agency, payments: [], expenses: rows, storageEvents: [], cash: null });
    return [agency, Object.freeze({ status: "AVAILABLE" as const, count: report.expenseCount, byCurrency: report.expensesByCurrency })];
  })) as Record<ReportAgency, ExpenseValue>;
}

async function readAllExpenses(businessDate: string) {
  const filters = { dateDebut: businessDate, dateFin: businessDate, page: 1, pageSize: 100 } as const;
  const first = await readAdminExpenses(SERVICE_ACTOR, filters);
  if (first.pagination.totalPages <= 1) return first.depenses;
  const rest = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => readAdminExpenses(SERVICE_ACTOR, { ...filters, page: index + 2 })));
  return [...first.depenses, ...rest.flatMap((page: AdminExpenseListResponse) => page.depenses)];
}

async function readProfit(query: BilanApiQuery) {
  const payload = await buildAdminBilan(query, SERVICE_ACTOR) as unknown as Record<string, unknown>;
  const results = record(payload.results); const finalProfit = record(results?.finalProfit); const byAgency = record(finalProfit?.byAgency);
  if (!finalProfit || !byAgency || typeof finalProfit.consolidatedUsd !== "number" || typeof finalProfit.status !== "string") throw new Error("BILAN_CONTRACT_INVALID");
  const values = Object.fromEntries(CASH_AGENCIES.map((agency) => {
    const row = record(byAgency[agency]);
    if (!row || typeof row.amountUsd !== "number") throw new Error("BILAN_CONTRACT_INVALID");
    return [agency, Object.freeze({ status: "AVAILABLE" as const, amountUsd: row.amountUsd, certification: finalProfit.status as string })];
  })) as Record<(typeof CASH_AGENCIES)[number], ProfitValue>;
  return Object.freeze({ byAgency: values, consolidatedUsd: finalProfit.consolidatedUsd, status: finalProfit.status });
}

async function readStorage() {
  const payload = await readAdminStorage();
  if (!Array.isArray(payload.accounts)) throw new Error("STORAGE_CONTRACT_INVALID");
  return Object.fromEntries(CASH_AGENCIES.map((agency) => {
    const row = payload.accounts.find((item: Record<string, unknown>) => item.agency === agency) as Record<string, unknown> | undefined;
    const parcels = row?.current_parcel_count; const weightKg = row?.current_weight_kg;
    if (typeof parcels !== "number" || typeof weightKg !== "number") throw new Error("STORAGE_CONTRACT_INVALID");
    return [agency, Object.freeze({ status: "AVAILABLE" as const, parcels, weightKg })];
  })) as Record<(typeof CASH_AGENCIES)[number], StockValue>;
}

async function isolated<T>(reader: () => Promise<T>) {
  try { return await withTimeout(reader(), SOURCE_TIMEOUT_MS); } catch { return null; }
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("SOURCE_TIMEOUT")), milliseconds); })]);
  } finally { if (timeout) clearTimeout(timeout); }
}

function sumCurrencies(rows: readonly CurrencyTotals[]) { const totals: Record<string, number> = {}; for (const row of rows) for (const [currency, amount] of Object.entries(row)) totals[currency] = (totals[currency] ?? 0) + amount; return Object.freeze(totals); }
function record(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : null; }
function notApplicableCash() { return Object.freeze({ status: "NOT_APPLICABLE" as const, balance: null, currency: null }); }
function unavailableCash() { return Object.freeze({ status: "UNAVAILABLE" as const, balance: null, currency: "USD" as const }); }
function unavailableExpenses() { return Object.freeze({ status: "UNAVAILABLE" as const, count: null, byCurrency: Object.freeze({}) }); }
function notApplicableProfit() { return Object.freeze({ status: "NOT_APPLICABLE" as const, amountUsd: null }); }
function unavailableProfit() { return Object.freeze({ status: "UNAVAILABLE" as const, amountUsd: null, certification: undefined as string | undefined }); }
function notApplicableStock() { return Object.freeze({ status: "NOT_APPLICABLE" as const, parcels: null, weightKg: null }); }
function unavailableStock() { return Object.freeze({ status: "UNAVAILABLE" as const, parcels: null, weightKg: null }); }
