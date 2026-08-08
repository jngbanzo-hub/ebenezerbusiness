import "server-only";

import { buildDailyAgencyReport, REPORT_AGENCIES, type DailyAgencyReport, type ReportAgency } from "@/features/daily-report/daily-report";
import { readAdminExpenses } from "@/server/agent-expenses-apps-script";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { createServerCashDashboardSource, readCashReportMetadata } from "@/server/cash-dashboard-source";
import { readStorageReportEvents } from "@/server/stockages-v2";
import { enumerateReportDates } from "@/features/daily-report/report-period";

export async function readDailyReport(input: { from: string; to: string; agencies: readonly ReportAgency[]; actor: { userId: string; email: string; agency: ReportAgency | null }; includePrivateNotes: boolean }) {
  const dates = enumerateReportDates(input.from, input.to);
  const cashSource = createServerCashDashboardSource();
  const [allPayments, storageEvents, cashDays, metadata] = await Promise.all([
    readAdminPayments(),
    readStorageReportEvents(input.from, input.to),
    Promise.all(dates.map((date) => cashSource.readAdmin(date))),
    readCashReportMetadata(input.from, input.to)
  ]);
  const payments = allPayments.filter((row) => row.dateKey >= input.from && row.dateKey <= input.to);
  const expensesByAgency = await Promise.all(input.agencies.map((agency) => readAllExpenses(input.actor, input.from, input.to, agency)));
  const expenses = expensesByAgency.flat();
  const firstCash = cashDays[0];
  const lastCash = cashDays[cashDays.length - 1];
  const reports = input.agencies.map((agency) => {
    const first = firstCash?.agencies.find((row) => row.agency === agency);
    const last = lastCash?.agencies.find((row) => row.agency === agency);
    const rows = cashDays.flatMap((day) => day.agencies.filter((row) => row.agency === agency));
    const paymentsTotal = cents(rows.reduce((sum, row) => sum + row.paymentsTotal, 0));
    const expensesTotal = cents(rows.reduce((sum, row) => sum + row.expensesTotal, 0));
    const correctionsNet = cents(rows.reduce((sum, row) => sum + row.correctionsNet, 0));
    const cashSummary: DailyAgencyReport["cash"] = agency === "COO" || !first || !last ? null : Object.freeze({ status: last.accountStatus, openingBalance: first.openingBalance, paymentsTotal, expensesTotal, correctionsNet, currentBalance: cents(first.openingBalance + paymentsTotal - expensesTotal + correctionsNet) });
    const notes = metadata.notes.filter((row) => row.agency === agency && row.reportFrom === input.from && row.reportTo === input.to && (input.includePrivateNotes || row.visibleToAgents));
    return buildDailyAgencyReport({ agency, payments, expenses, storageEvents, cash: cashSummary, adjustments: metadata.adjustments.filter((row) => row.agency === agency), notes });
  });
  return Object.freeze({ from: input.from, to: input.to, agencies: Object.freeze(reports) });
}

export function allReportAgencies() { return REPORT_AGENCIES; }

async function readAllExpenses(actor: { userId: string; email: string; agency: ReportAgency | null }, from: string, to: string, agency: ReportAgency) {
  const first = await readAdminExpenses(actor, { dateDebut: from, dateFin: to, agence: agency, page: 1, pageSize: 100 });
  if (first.pagination.totalPages <= 1) return first.depenses;
  const rest = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => readAdminExpenses(actor, { dateDebut: from, dateFin: to, agence: agency, page: index + 2, pageSize: 100 })));
  return [...first.depenses, ...rest.flatMap((page) => page.depenses)];
}
function cents(value: number) { return Math.round(value * 100) / 100; }
