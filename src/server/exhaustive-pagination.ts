export const SUPABASE_PAGE_SIZE = 1000;

export type PaginationMetrics = {
  pageCount: number;
  rowCount: number;
  exceededSinglePage: boolean;
  durationMs: number;
};

export async function readExhaustivePages<T>(
  fetchPage: (from: number, to: number) => Promise<readonly T[]>,
  options: { pageSize?: number; identity?: (row: T) => string } = {}
): Promise<{ rows: T[]; metrics: PaginationMetrics }> {
  const pageSize = options.pageSize ?? SUPABASE_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error("INVALID_PAGE_SIZE");
  const startedAt = performance.now();
  const rows: T[] = [];
  const identities = new Set<string>();
  let pageCount = 0;

  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    pageCount += 1;
    if (page.length > pageSize) throw new Error("PAGINATION_PAGE_OVERFLOW");
    for (const row of page) {
      const identity = options.identity?.(row);
      if (identity !== undefined) {
        if (!identity || identities.has(identity)) throw new Error("PAGINATION_DUPLICATE_IDENTITY");
        identities.add(identity);
      }
      rows.push(row);
    }
    if (page.length < pageSize) break;
  }

  return {
    rows,
    metrics: {
      pageCount,
      rowCount: rows.length,
      exceededSinglePage: rows.length > pageSize,
      durationMs: performance.now() - startedAt
    }
  };
}
