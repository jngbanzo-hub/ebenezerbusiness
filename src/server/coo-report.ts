import type { AdminPayment } from "@/features/admin/types";
import type { AdminExpenseListResponse } from "@/server/agent-expenses-apps-script";

export type CooReportExpense = AdminExpenseListResponse["depenses"][number];

export type CooReport = Readonly<{
  agency: "COO";
  readOnly: true;
  from: string;
  to: string;
  payments: readonly AdminPayment[];
  expenses: readonly CooReportExpense[];
  summary: Readonly<{
    paymentCount: number;
    paymentsTotalUsd: number;
    expenseCount: number;
    expensesByCurrency: Readonly<Record<string, number>>;
  }>;
}>;

export function buildCooReport(input: {
  from: string;
  to: string;
  code?: string;
  label?: string;
  payments: readonly AdminPayment[];
  expenses: readonly CooReportExpense[];
}): CooReport {
  const code = normalizeSearch(input.code);
  const label = normalizeSearch(input.label);
  const payments = input.payments.filter((row) =>
    row.agenceEncaissement === "COO" &&
    row.dateKey >= input.from && row.dateKey <= input.to &&
    (!code || normalizeSearch(row.codeColis).includes(code))
  );
  const expenses = input.expenses.filter((row) =>
    row.agence === "COO" && !row.annulee &&
    row.date >= input.from && row.date <= input.to &&
    (!label || normalizeSearch(`${row.categorie} ${row.description} ${row.observation}`).includes(label))
  );
  const expensesByCurrency: Record<string, number> = {};
  for (const expense of expenses) {
    expensesByCurrency[expense.devise] = cents((expensesByCurrency[expense.devise] ?? 0) + expense.montant);
  }
  return Object.freeze({
    agency: "COO",
    readOnly: true,
    from: input.from,
    to: input.to,
    payments: Object.freeze(payments),
    expenses: Object.freeze(expenses),
    summary: Object.freeze({
      paymentCount: payments.length,
      paymentsTotalUsd: cents(payments.reduce((sum, row) => sum + row.montantPaye, 0)),
      expenseCount: expenses.length,
      expensesByCurrency: Object.freeze(expensesByCurrency)
    })
  });
}

export function normalizeSearch(value: string | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}

function cents(value: number) {
  return Math.round(value * 100) / 100;
}
