import "server-only";

import { buildDailyAgencyReport, REPORT_AGENCIES, type DailyAgencyReport, type ReportAgency } from "@/features/daily-report/daily-report";
import { readAdminExpenses } from "@/server/agent-expenses-apps-script";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { createServerCashDashboardSource } from "@/server/cash-dashboard-source";
import { readStorageReportEvents } from "@/server/stockages-v2";

export async function readDailyReport(input: { businessDate: string; agencies: readonly ReportAgency[]; actor: { userId: string; email: string; agency: ReportAgency | null } }) {
  const [allPayments, storageEvents, cash] = await Promise.all([
    readAdminPayments(),
    readStorageReportEvents(input.businessDate),
    createServerCashDashboardSource().readAdmin(input.businessDate)
  ]);
  const payments = allPayments.filter((row) => row.dateKey === input.businessDate);
  const expensesByAgency = await Promise.all(input.agencies.map((agency) => readAllExpenses(input.actor, input.businessDate, agency)));
  const expenses = expensesByAgency.flat();
  const cashByAgency = new Map(cash.agencies.map((row) => [row.agency, row]));
  const reports = input.agencies.map((agency) => {
    const row = cashByAgency.get(agency as "FIH" | "LSHI" | "KLZ");
    const cashSummary: DailyAgencyReport["cash"] = agency === "COO" || !row ? null : Object.freeze({ status: row.accountStatus, openingBalance: row.openingBalance, paymentsTotal: row.paymentsTotal, expensesTotal: row.expensesTotal, correctionsNet: row.correctionsNet, currentBalance: row.currentBalance });
    return buildDailyAgencyReport({ agency, payments, expenses, storageEvents, cash: cashSummary });
  });
  return Object.freeze({ businessDate: input.businessDate, agencies: Object.freeze(reports) });
}

export function allReportAgencies() { return REPORT_AGENCIES; }

async function readAllExpenses(actor: { userId: string; email: string; agency: ReportAgency | null }, businessDate: string, agency: ReportAgency) {
  const first = await readAdminExpenses(actor, { dateDebut: businessDate, dateFin: businessDate, agence: agency, page: 1, pageSize: 100 });
  if (first.pagination.totalPages <= 1) return first.depenses;
  const rest = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => readAdminExpenses(actor, { dateDebut: businessDate, dateFin: businessDate, agence: agency, page: index + 2, pageSize: 100 })));
  return [...first.depenses, ...rest.flatMap((page) => page.depenses)];
}
