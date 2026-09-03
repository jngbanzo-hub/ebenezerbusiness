type ConfirmedExpenseSummary = Readonly<{
  category: string;
  amount: number;
  currency: string;
}>;

export function formatExpenseAmount(amount: number, currency: string) {
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)} ${currency}`;
}

export function expenseSuccessDetail(expense: ConfirmedExpenseSummary) {
  return `${expense.category} — ${formatExpenseAmount(
    expense.amount,
    expense.currency
  )}`;
}
