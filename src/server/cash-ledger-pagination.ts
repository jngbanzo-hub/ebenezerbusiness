export const CASH_LEDGER_PAGE_SIZE = 1000;

export async function readAllCashLedgerPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += CASH_LEDGER_PAGE_SIZE) {
    const page = await fetchPage(from, from + CASH_LEDGER_PAGE_SIZE - 1);
    rows.push(...page);
    if (page.length < CASH_LEDGER_PAGE_SIZE) return rows;
  }
}
