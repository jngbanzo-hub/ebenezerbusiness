// Test-only fixture: read the explicit migration seed, never used at runtime.
import { readFileSync } from "node:fs";
import nodeTest from "node:test";
import type { CohortDefinition } from "./bilan-contracts";
import { withBilanCohorts } from "./cohort-registry";
const sql = readFileSync("local-preparation/supabase/bilan/024_bilan_origin_months.sql", "utf8");
export const TEST_COHORTS: readonly CohortDefinition[] = Array.from(sql.matchAll(/\('([A-Z]+)',(\d{4}),(\d{1,2}),'([^']+)'\)/g)).map(([, prefix, year, month, label]) => ({
  prefix, year: Number(year), month: Number(month), label, id: `${Number(year)}-${month.padStart(2, "0")}`
}));
export default function test(name: string, run: () => unknown | Promise<unknown>) {
  return nodeTest(name, async () => { await withBilanCohorts(TEST_COHORTS, run); });
}
