import assert from "node:assert/strict";
import test from "node:test";

import { CashDashboardSource } from "./cash-dashboard-source";

const rows: Record<string, Record<string, unknown>[]> = {
  cash_accounts: [{ agency: "LSHI", currency: "USD", status: "SUSPENDED" }, { agency: "FIH", currency: "USD", status: "SUSPENDED" }, { agency: "KLZ", currency: "USD", status: "SUSPENDED" }],
  cash_current_day: [{ agency: "LSHI", business_date: "2026-07-31", payments_total: 30, expenses_total: 5, corrections_net: -2 }],
  cash_agency_totals: [{ agency: "LSHI", business_date: "2026-07-31", payment_count: 2, payments_total: 30, expenses_total: 5 }],
  cash_agent_payment_details: [{ agency: "LSHI", business_date: "2026-07-31", actor_user_id: "agent-a", actor_name_snapshot: "Agent A", payment_count: 1, amount_collected: 10 }, { agency: "LSHI", business_date: "2026-07-31", actor_user_id: "agent-b", actor_name_snapshot: "Agent B", payment_count: 1, amount_collected: 20 }],
  cash_daily_history: [{ agency: "LSHI", business_date: "2026-07-30", opening_balance: 50, payments_total: 10, expenses_total: 0, corrections_net: 0, closing_balance: 60, status: "CLOSED", version: 1, closed_at: "2026-07-30T22:00:00Z", reopened_at: null }],
  cash_anomalies: [],
  cash_events: [],
  cash_coo_revenue_outside_cash: [],
  cash_admin_audit: []
};

function fakeClient() {
  return { schema: () => ({ from: (table: string) => ({ select: () => {
    let selected = [...(rows[table] ?? [])];
    const query = { eq(column: string, value: string) { selected = selected.filter((row) => row[column] === value); return query; }, then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: selected, error: null }).then(resolve); } };
    return query;
  } }) }) };
}

test("deux agents alimentent une caisse agence unique sans doublon", async () => {
  const source = new CashDashboardSource(fakeClient() as never);
  const cash = await source.readAgent("LSHI", "2026-07-31");
  assert.equal(cash.byAgent.length, 2);
  assert.equal(cash.paymentCount, 2);
  assert.equal(cash.paymentsTotal, 30);
  assert.equal(cash.currentBalance, 83);
  assert.equal(cash.accountStatus, "SUSPENDED");
});
test("la lecture Agent est strictement limitée à l’agence demandée", async () => {
  const source = new CashDashboardSource(fakeClient() as never);
  const cash = await source.readAgent("FIH", "2026-07-31");
  assert.equal(cash.agency, "FIH");
  assert.equal(cash.byAgent.length, 0);
  assert.equal(cash.currentBalance, 0);
});

test("Admin voit exactement FIH LSHI KLZ et COO hors caisse", async () => {
  const source = new CashDashboardSource(fakeClient() as never);
  const dashboard = await source.readAdmin("2026-07-31");
  assert.deepEqual(dashboard.agencies.map((item) => item.agency), ["FIH", "LSHI", "KLZ"]);
  assert.equal(dashboard.cooOutsideCash.paymentsTotal, 0);
  assert.equal(dashboard.actions.adjustment, "UNAVAILABLE");
});
