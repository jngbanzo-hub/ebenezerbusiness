import type { CohortDefinition, CohortResolution } from "./bilan-contracts";

export const BILAN_COHORTS = Object.freeze([
  cohort("JL", 2026, 7, "Juillet 2026"),
  cohort("AT", 2026, 8, "Août 2026"),
  cohort("SE", 2026, 9, "Septembre 2026")
]) satisfies readonly CohortDefinition[];

export function discoverCohorts(rows: readonly { code: string; date: string }[]): readonly CohortDefinition[] {
  const discovered = new Map<string, CohortDefinition>();
  for (const row of rows) {
    const code = canonicalParcelCode(row.code);
    const prefix = code.match(/^[A-Z]+/)?.[0];
    const date = row.date.slice(0, 10);
    if (!prefix || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    if (month < 1 || month > 12) continue;
    const definition = cohort(prefix, year, month, `${monthLabel(month)} ${year}`);
    discovered.set(`${definition.prefix}|${definition.year}`, definition);
  }
  for (const definition of BILAN_COHORTS) discovered.set(`${definition.prefix}|${definition.year}`, definition);
  return Object.freeze(Array.from(discovered.values()).sort((a, b) => a.year - b.year || a.month - b.month || a.prefix.localeCompare(b.prefix)));
}

export function resolveCohort(rawCode: string, definitions: readonly CohortDefinition[] = BILAN_COHORTS): CohortResolution {
  const canonicalCode = canonicalParcelCode(rawCode);
  const definition = definitions.find(({ prefix }) => canonicalCode.startsWith(prefix));
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

function monthLabel(month: number) {
  return ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"][month];
}
