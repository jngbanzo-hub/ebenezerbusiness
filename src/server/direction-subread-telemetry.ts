import { AsyncLocalStorage } from "node:async_hooks";

type Source = "CAISSE" | "BENEFICE" | "STOCK" | "DEPENSES";
type Counts = Readonly<{ pages?: number; rows?: number }>;

const context = new AsyncLocalStorage<Source>();

export function traceDirectionSource<T>(source: Source, operation: () => Promise<T>): Promise<T> {
  return context.run(source, operation);
}

export function logDirectionSubread(name: string, startedAt: number, status: "SUCCESS" | "FAILURE" | "TIMEOUT", counts: Counts = {}) {
  const source = context.getStore();
  if (!source) return;
  try {
    const endedAt = Date.now();
    console.info("[direction-summary] subread", {
      source,
      subread: name,
      started_at: new Date(startedAt).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      duration_ms: endedAt - startedAt,
      status,
      ...(counts.pages === undefined ? {} : { pages: counts.pages }),
      ...(counts.rows === undefined ? {} : { rows: counts.rows })
    });
  } catch {
    // Diagnostic logging must never affect the business result.
  }
}

export async function measureDirectionSubread<T>(
  name: string,
  operation: () => PromiseLike<T> | T,
  counts: (value: T) => Counts = () => ({})
): Promise<T> {
  if (!context.getStore()) return await operation();
  const startedAt = Date.now();
  try {
    console.info("[direction-summary] subread_start", {
      source: context.getStore(), subread: name, started_at: new Date(startedAt).toISOString()
    });
  } catch { /* Diagnostic logging must not affect the reader. */ }
  try {
    const result = await operation();
    const error = result && typeof result === "object" && "error" in result && result.error;
    let observedCounts: Counts = {};
    try { observedCounts = counts(result); } catch { /* No impact on the reader. */ }
    logDirectionSubread(name, startedAt, error ? "FAILURE" : "SUCCESS", observedCounts);
    return result;
  } catch (error) {
    const timeout = error instanceof Error && /timeout|timed out/i.test(error.message);
    logDirectionSubread(name, startedAt, timeout ? "TIMEOUT" : "FAILURE");
    throw error;
  }
}

export function countRows(value: unknown): Counts {
  if (Array.isArray(value)) return { rows: value.length };
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.rows)) return { rows: record.rows.length };
    if (Array.isArray(record.data)) return { rows: record.data.length };
  }
  return {};
}
