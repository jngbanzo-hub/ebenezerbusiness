import { monthPeriod } from "./cohort-catalog";
import type { CohortDefinition } from "./bilan-contracts";
import { parseBilanQuery } from "./bilan-query-validation";
import { buildBilanQuery } from "./bilan-ui";

export type BilanFilters = Readonly<{
  cohort: string;
  mode: "MONTH" | "CUSTOM";
  from: string;
  to: string;
}>;

// A cohort change replaces the whole selection, including any custom range.
export function createBilanFilters(prefix: string, definitions: readonly CohortDefinition[]): BilanFilters {
  const cohort = definitions.find((item) => item.prefix === prefix);
  if (!cohort) throw new Error("COHORTE NON RÉSOLUE");
  return { cohort: cohort.prefix, mode: "MONTH", ...monthPeriod(cohort.year, cohort.month) };
}

export function buildBilanFilterQuery(filters: BilanFilters, definitions: readonly CohortDefinition[]) {
  const definition = definitions.find((item) => item.prefix === filters.cohort);
  if (!definition) throw new Error("COHORTE NON RÉSOLUE");
  const period = filters.mode === "MONTH" ? monthPeriod(definition.year, definition.month) : filters;
  const query = buildBilanQuery(filters.cohort, period, filters.mode);
  const parsed = parseBilanQuery(`https://bilan.invalid/?${query}`, definitions);
  if (parsed.state !== "VALID") throw new Error(parsed.state === "INVALID" ? parsed.message : "COHORTE NON RÉSOLUE");
  return query;
}

// Abort is best-effort: the identity check also rejects late success/error/finally.
export function createBilanRequestGuard() {
  let current: AbortController | null = null;
  return {
    invalidate() { current?.abort(); current = null; },
    begin() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return { signal: controller.signal, isCurrent: () => current === controller && !controller.signal.aborted };
    }
  };
}
