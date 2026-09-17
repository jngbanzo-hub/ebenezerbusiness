import type { CohortDefinition, CohortResolution } from "./bilan-contracts";

export type OriginMonth = CohortDefinition & Readonly<{
  registryId: string; active: boolean; createdAt: string; updatedAt: string;
}>;

export function canonicalParcelCode(rawCode: string) {
  return rawCode.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function monthPeriod(year: number, month: number) {
  return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}

export function resolveCatalogCohort(rawCode: string, definitions: readonly CohortDefinition[]): CohortResolution {
  const code = canonicalParcelCode(rawCode);
  const matches = definitions.filter(item => code.startsWith(item.prefix));
  if (matches.length === 1) return { state: "RESOLVED", definition: matches[0] };
  return { state: "UNRESOLVED", code: "COHORTE_NON_RESOLUE", prefix: code.match(/^[A-Z]+/)?.[0] ?? "" };
}

export function validateCohortDefinitions(definitions: readonly CohortDefinition[]) {
  if (!definitions.length) throw new Error("BILAN_REGISTRY_UNAVAILABLE");
  const periods = new Set<string>();
  for (const row of definitions) {
    if (!/^[A-Z]{2,8}$/.test(row.prefix) || !Number.isInteger(row.year) || row.year < 2000 || row.year > 2199 ||
        !Number.isInteger(row.month) || row.month < 1 || row.month > 12 || !row.label.trim() || row.label.length > 80 ||
        row.id !== `${row.year}-${String(row.month).padStart(2, "0")}` || periods.has(row.id)) throw new Error("BILAN_REGISTRY_INVALID");
    periods.add(row.id);
    if (definitions.filter(other => other.prefix.startsWith(row.prefix) || row.prefix.startsWith(other.prefix)).length !== 1) throw new Error("BILAN_REGISTRY_INVALID");
  }
}
