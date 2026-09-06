import type { CohortDefinition, CohortResolution } from "./bilan-contracts";

export const BILAN_COHORTS = Object.freeze([
  cohort("JL", 2026, 7, "Juillet 2026"),
  cohort("AT", 2026, 8, "Août 2026"),
  cohort("SE", 2026, 9, "Septembre 2026")
]) satisfies readonly CohortDefinition[];

export function resolveCohort(rawCode: string): CohortResolution {
  const canonicalCode = canonicalParcelCode(rawCode);
  const definition = BILAN_COHORTS.find(({ prefix }) => canonicalCode.startsWith(prefix));
  if (definition) return { state: "RESOLVED", definition };
  return {
    state: "UNRESOLVED",
    code: "COHORTE_NON_RESOLUE",
    prefix: canonicalCode.match(/^[A-Z]+/)?.[0] ?? ""
  };
}

export function canonicalParcelCode(rawCode: string) {
  return rawCode.trim().toUpperCase().replace(/[\s-]+/g, "");
}

function cohort(prefix: string, year: number, month: number, label: string): CohortDefinition {
  const normalizedPrefix = prefix.trim().toUpperCase();
  return Object.freeze({
    prefix: normalizedPrefix,
    year,
    month,
    id: `${year}-${String(month).padStart(2, "0")}` as CohortDefinition["id"],
    label
  });
}
