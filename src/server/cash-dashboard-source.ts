import "server-only";

import { resolveCashOpeningBalance } from "@/features/daily-report/cash-period";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  CASH_AGENCIES,
  type AdminCashDashboard,
  type CashAgency,
  type CashDashboard,
  type CashHistoryEntry
} from "@/features/cash/cash-dashboard";

export class CashDashboardSourceError extends Error {}

type QueryClient = Pick<SupabaseClient, "schema">;

export class CashDashboardSource {
  constructor(private readonly client: QueryClient) {}

  async readAgent(agency: CashAgency, businessDate: string): Promise<CashDashboard> {
    return this.readAgency(agency, businessDate);
  }

  async readAdmin(businessDate: string): Promise<AdminCashDashboard> {
    const agencies = await Promise.all(CASH_AGENCIES.map((agency) => this.readAgency(agency, businessDate)));
    const [cooRows, auditRows] = await Promise.all([
      this.select("cash_coo_revenue_outside_cash", "business_date,actor_user_id,actor_name_snapshot,payment_count,amount_collected", { business_date: businessDate }),
      this.select("cash_admin_audit", "audit_id,agency,action,reason,admin_name_snapshot,occurred_at")
    ]);
    const byAgent = cooRows.map((row) => ({
      actorUserId: text(row.actor_user_id), actorName: text(row.actor_name_snapshot),
      paymentCount: integer(row.payment_count), amountCollected: money(row.amount_collected)
    }));
    return Object.freeze({
      businessDate,
      agencies,
      cooOutsideCash: Object.freeze({
        businessDate,
        paymentCount: byAgent.reduce((sum, item) => sum + item.paymentCount, 0),
        paymentsTotal: cents(byAgent.reduce((sum, item) => sum + item.amountCollected, 0)),
        expensesTotal: 0,
        byAgent: Object.freeze(byAgent)
      }),
      audit: Object.freeze(auditRows.map((row) => Object.freeze({
        auditId: text(row.audit_id), agency: cashAgency(row.agency), action: text(row.action),
        reason: text(row.reason), adminName: text(row.admin_name_snapshot), occurredAt: text(row.occurred_at)
      }))),
      actions: Object.freeze({ openingBalance: "AVAILABLE", adjustment: "UNAVAILABLE", correction: "UNAVAILABLE", closeDay: "UNAVAILABLE", reopenDay: "UNAVAILABLE" })
    });
  }

  private async readAgency(agency: CashAgency, businessDate: string): Promise<CashDashboard> {
    const [accounts, currentDay, totals, agents, history, anomalies, opening, ledger] = await Promise.all([
      this.select("cash_accounts", "agency,currency,status", { agency }),
      this.select("cash_current_day", "agency,business_date,payments_total,expenses_total,corrections_net", { agency, business_date: businessDate }),
      this.select("cash_agency_totals", "agency,business_date,payment_count,payments_total,expenses_total", { agency, business_date: businessDate }),
      this.select("cash_agent_payment_details", "agency,business_date,actor_user_id,actor_name_snapshot,payment_count,amount_collected", { agency, business_date: businessDate }),
      this.select("cash_daily_history", "agency,business_date,opening_balance,payments_total,expenses_total,corrections_net,closing_balance,status,version,closed_at,reopened_at", { agency }),
      this.select("cash_anomalies", "agency,business_date,anomaly_type", { agency }),
      this.select("cash_events", "amount", { agency, event_type: "OPENING_BALANCE_RECORDED" })
      ,this.select("cash_events", "event_type,direction,amount,business_date", { agency })
    ]);
    if (accounts.length !== 1) throw new CashDashboardSourceError("CASH_ACCOUNT_NOT_FOUND");
    const day = currentDay[0];
    const total = totals[0];
    const historyEntries = history.map(decodeHistory).sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.version - a.version);
    const previous = historyEntries.find((entry) => entry.businessDate < businessDate && entry.status === "CLOSED");
    const initialBalance = opening.length ? money(opening[0].amount) : null;
    const openingBalance = resolveCashOpeningBalance({
      businessDate,
      initialBalance,
      previousClosedDay: previous,
      ledger: ledger.map((row) => ({ eventType: text(row.event_type), businessDate: text(row.business_date), amount: money(row.amount), direction: text(row.direction) === "CREDIT" ? "CREDIT" : "DEBIT" }))
    });
    const paymentsTotal = money(day?.payments_total ?? total?.payments_total ?? 0);
    const expensesTotal = money(day?.expenses_total ?? total?.expenses_total ?? 0);
    const correctionsNet = money(day?.corrections_net ?? 0);
    return Object.freeze({
      agency,
      businessDate,
      currency: "USD",
      accountStatus: accountStatus(accounts[0].status),
      openingBalance,
      initialBalance,
      paymentCount: integer(total?.payment_count ?? 0),
      paymentsTotal,
      expensesTotal,
      correctionsNet,
      currentBalance: cents(openingBalance + paymentsTotal - expensesTotal + correctionsNet),
      byAgent: Object.freeze(agents.map((row) => Object.freeze({ actorUserId: text(row.actor_user_id), actorName: text(row.actor_name_snapshot), paymentCount: integer(row.payment_count), amountCollected: money(row.amount_collected) }))),
      history: Object.freeze(historyEntries),
      closures: Object.freeze(historyEntries),
      anomalies: Object.freeze(anomalies.map((row) => Object.freeze({ businessDate: text(row.business_date), type: text(row.anomaly_type) })))
    });
  }

  private async select(table: string, columns: string, filters: Record<string, string> = {}) {
    let query = this.client.schema("public").from(table).select(columns);
    for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new CashDashboardSourceError("CASH_READ_FAILED");
    return data as unknown as Record<string, unknown>[];
  }
}

export function createServerCashDashboardSource() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new CashDashboardSourceError("CASH_SOURCE_NOT_CONFIGURED");
  return new CashDashboardSource(createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch }
  }));
}

export async function readCashReportMetadata(from: string, to: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new CashDashboardSourceError("CASH_SOURCE_NOT_CONFIGURED");
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch }
  });
  const [events, audit] = await Promise.all([
    client.schema("public").from("cash_events")
      .select("event_id,agency,direction,amount,reason,actor_name_snapshot,occurred_at,business_date")
      .eq("event_type", "ADMIN_ADJUSTMENT_RECORDED").gte("business_date", from).lte("business_date", to),
    client.schema("public").from("cash_admin_audit")
      .select("audit_id,agency,action,new_value,admin_name_snapshot,occurred_at,metadata")
      .eq("action", "DAILY_REPORT_NOTE")
  ]);
  if (events.error || audit.error) throw new CashDashboardSourceError("CASH_READ_FAILED");
  return Object.freeze({
    adjustments: Object.freeze((events.data ?? []).map((row) => Object.freeze({
      eventId: text(row.event_id), agency: cashAgency(row.agency),
      direction: row.direction === "DEBIT" ? "DEBIT" as const : "CREDIT" as const,
      amount: money(row.amount), reason: text(row.reason), admin: text(row.actor_name_snapshot),
      occurredAt: text(row.occurred_at)
    }))),
    notes: Object.freeze((audit.data ?? []).map((row) => {
      const value = row.new_value && typeof row.new_value === "object" ? row.new_value as Record<string, unknown> : {};
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
      return Object.freeze({ auditId: text(row.audit_id), agency: cashAgency(row.agency), content: text(value.content), admin: text(row.admin_name_snapshot), occurredAt: text(row.occurred_at), visibleToAgents: metadata.visibleToAgents === true, reportFrom: text(metadata.from), reportTo: text(metadata.to) });
    }))
  });
}

function decodeHistory(row: Record<string, unknown>): CashHistoryEntry { return Object.freeze({ businessDate: text(row.business_date), openingBalance: money(row.opening_balance), paymentsTotal: money(row.payments_total), expensesTotal: money(row.expenses_total), correctionsNet: money(row.corrections_net), closingBalance: money(row.closing_balance), status: row.status === "REOPENED" ? "REOPENED" : "CLOSED", version: integer(row.version), closedAt: text(row.closed_at), reopenedAt: row.reopened_at === null ? null : text(row.reopened_at) }); }
function cashAgency(value: unknown): CashAgency { if (!CASH_AGENCIES.includes(value as CashAgency)) throw new CashDashboardSourceError("CASH_ROW_INVALID"); return value as CashAgency; }
function accountStatus(value: unknown) { if (!["ACTIVE", "SUSPENDED", "CLOSED"].includes(String(value))) throw new CashDashboardSourceError("CASH_ROW_INVALID"); return value as "ACTIVE" | "SUSPENDED" | "CLOSED"; }
function text(value: unknown) { if (typeof value !== "string" || !value.trim()) throw new CashDashboardSourceError("CASH_ROW_INVALID"); return value; }
function money(value: unknown) { const number = typeof value === "number" ? value : Number(value); if (!Number.isFinite(number)) throw new CashDashboardSourceError("CASH_ROW_INVALID"); return cents(number); }
function integer(value: unknown) { const number = Number(value); if (!Number.isInteger(number) || number < 0) throw new CashDashboardSourceError("CASH_ROW_INVALID"); return number; }
function cents(value: number) { return Math.round(value * 100) / 100; }
function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: "no-store" });
}
