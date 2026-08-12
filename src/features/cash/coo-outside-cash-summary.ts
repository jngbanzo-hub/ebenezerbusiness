import type { AdminCashDashboard } from "@/features/cash/cash-dashboard";

type Payment = Readonly<{
  agenceEncaissement: string;
  dateKey: string;
  montantPaye: number;
  agent: string;
}>;

type Expense = Readonly<{
  agence: string;
  devise: string;
  montant: number;
  annulee: boolean;
}>;

export function buildCooOutsideCashSummary(
  businessDate: string,
  payments: readonly Payment[],
  expenses: readonly Expense[]
): AdminCashDashboard["cooOutsideCash"] {
  const cooPayments = payments.filter(
    (payment) => payment.agenceEncaissement === "COO" && payment.dateKey === businessDate
  );
  const byAgent = new Map<string, { paymentCount: number; amountCollected: number }>();
  for (const payment of cooPayments) {
    const name = payment.agent.trim() || "Agent COO";
    const current = byAgent.get(name) ?? { paymentCount: 0, amountCollected: 0 };
    current.paymentCount += 1;
    current.amountCollected = cents(current.amountCollected + payment.montantPaye);
    byAgent.set(name, current);
  }
  return Object.freeze({
    businessDate,
    paymentCount: cooPayments.length,
    paymentsTotal: cents(cooPayments.reduce((sum, payment) => sum + payment.montantPaye, 0)),
    expensesTotal: cents(expenses
      .filter((expense) => expense.agence === "COO" && expense.devise === "USD" && !expense.annulee)
      .reduce((sum, expense) => sum + expense.montant, 0)),
    byAgent: Object.freeze(Array.from(byAgent.entries())
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([actorName, totals]) => Object.freeze({
        actorUserId: `coo-agent:${actorName.toLocaleLowerCase("fr")}`,
        actorName,
        paymentCount: totals.paymentCount,
        amountCollected: totals.amountCollected
      })))
  });
}

function cents(value: number) {
  return Math.round(value * 100) / 100;
}
