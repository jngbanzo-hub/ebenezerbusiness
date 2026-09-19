import { readExhaustivePages, SUPABASE_PAGE_SIZE } from "@/server/exhaustive-pagination";

export const CASH_LEDGER_PAGE_SIZE = SUPABASE_PAGE_SIZE;

export async function readAllCashLedgerPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>, identity?: (row: T) => string): Promise<T[]> {
  return (await readExhaustivePages(fetchPage, { identity })).rows;
}
