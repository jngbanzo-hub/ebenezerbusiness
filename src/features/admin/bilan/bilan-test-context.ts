// Test-only fixture: read the explicit migration seed, never used at runtime.
import nodeTest from "node:test";
import type { CohortDefinition } from "./bilan-contracts";
import { withBilanCohorts } from "./cohort-registry";
const rows = [["MR",2026,3,"Mars 2026"],["AV",2026,4,"Avril 2026"],["MA",2026,5,"Mai 2026"],["JN",2026,6,"Juin 2026"],["JL",2026,7,"Juillet 2026"],["AT",2026,8,"Août 2026"],["SE",2026,9,"Septembre 2026"],["OT",2026,10,"Octobre 2026"],["NV",2026,11,"Novembre 2026"],["DC",2026,12,"Décembre 2026"],["JA",2027,1,"Janvier 2027"],["FE",2027,2,"Février 2027"]] as const;
export const TEST_COHORTS: readonly CohortDefinition[] = rows.map(([prefix, year, month, label]) => ({ prefix, year, month, label, id: `${year}-${String(month).padStart(2, "0")}` }));
export default function test(name: string, run: () => unknown | Promise<unknown>) {
  return nodeTest(name, async () => { await withBilanCohorts(TEST_COHORTS, run); });
}
