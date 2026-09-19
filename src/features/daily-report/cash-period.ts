export function resolveCashOpeningBalance(input: {
  businessDate: string;
  initialBalance: number | null;
  previousClosedDay?: Readonly<{ businessDate: string; closingBalance: number }>;
  ledger: readonly Readonly<{ eventType: string; businessDate: string; amount: number; direction: "CREDIT" | "DEBIT" }>[];
}) {
  const priorMovements = input.ledger.filter((row) => row.eventType !== "OPENING_BALANCE_RECORDED"
    && row.businessDate < input.businessDate
    && (!input.previousClosedDay || row.businessDate > input.previousClosedDay.businessDate));
  const openingBase = input.previousClosedDay?.closingBalance ?? input.initialBalance ?? 0;
  return cents(openingBase + priorMovements.reduce((sum, row) => sum + (row.direction === "CREDIT" ? row.amount : -row.amount), 0));
}

function cents(value: number) {
  return Math.round(value * 100) / 100;
}
