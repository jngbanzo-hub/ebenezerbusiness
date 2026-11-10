import type { AdminExpense, AdminExpensesResponse } from "../expenses";

// The Bilan already requests every page. Keep the rows unchanged, but do not
// present a partial or drifting multi-page read as a complete breakdown.
export function combineExpensePages(pages: readonly AdminExpensesResponse[]): Readonly<{ rows: readonly AdminExpense[]; complete: boolean }> {
  const rows = pages.flatMap((page) => page.depenses);
  const first = pages[0];
  if (!first) return Object.freeze({ rows, complete: false });
  const { total, totalPages, pageSize } = first.pagination;
  const expectedPages = Math.max(1, totalPages);
  const pageMetadataConsistent = totalPages === Math.ceil(total / pageSize)
    && pages.length === expectedPages
    && pages.every((item, index) => item.pagination.page === index + 1
      && item.pagination.pageSize === pageSize
      && item.pagination.total === total
      && item.pagination.totalPages === totalPages
      && item.depenses.length === Math.min(pageSize, Math.max(0, total - index * pageSize)));
  const uniqueReferences = new Set(rows.map((row) => row.expenseRequestId)).size === rows.length;
  return Object.freeze({ rows: Object.freeze(rows), complete: pageMetadataConsistent && rows.length === total && uniqueReferences });
}
