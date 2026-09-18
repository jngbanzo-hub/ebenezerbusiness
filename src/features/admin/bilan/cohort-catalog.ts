import type { CohortDefinition, CohortResolution } from "./bilan-contracts";

export type OriginMonth = CohortDefinition & Readonly<{
  registryId: string; active: boolean; createdAt: string; updatedAt: string;
}>;

export function canonicalParcelCode(rawCode: string) {
  return rawCode.trim().toUpperCase().replace(/[\s-]+/g, "");
}

/** The two trailing digits of a parcel code are the business year suffix.
 *  A trailing B/C/D suffix is part of the code identity and is ignored only
 *  for year extraction (never for code matching or deduplication).
 */
export function codeBusinessYear(rawCode: string): number | null {
  const code = canonicalParcelCode(rawCode);
  const match = code.match(/(\d{2})(?:[A-Z])?$/);
  return match ? 2000 + Number(match[1]) : null;
}

export function monthPeriod(year: number, month: number) {
  return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}

export function resolveCatalogCohort(rawCode: string, definitions: readonly CohortDefinition[], businessYear?: number): CohortResolution {
  const code = canonicalParcelCode(rawCode);
  const year = businessYear ?? codeBusinessYear(code) ?? undefined;
  const matches = definitions.filter(item => code.startsWith(item.prefix) && (year === undefined || item.year === year));
  if (matches.length === 1) return { state: "RESOLVED", definition: matches[0] };
  return { state: "UNRESOLVED", code: "COHORTE_NON_RESOLUE", prefix: code.match(/^[A-Z]+/)?.[0] ?? "" };
}

export function validateCohortDefinitions(definitions: readonly CohortDefinition[]) {
  if (!definitions.length) throw new Error("BILAN_REGISTRY_UNAVAILABLE");
  const periods = new Set<string>();
  for (const row of definitions) {
    const expectedMonth = { JA: 1, FE: 2, MR: 3, AV: 4, MA: 5, JN: 6, JL: 7, AT: 8, SE: 9, OT: 10, NV: 11, DC: 12 }[row.prefix as keyof typeof MONTH_BY_PREFIX];
    if (!/^[A-Z]{2,8}$/.test(row.prefix) || !Number.isInteger(row.year) || row.year < 2000 || row.year > 2199 ||
        !Number.isInteger(row.month) || row.month < 1 || row.month > 12 || !row.label.trim() || row.label.length > 80 ||
        row.id !== `${row.year}-${String(row.month).padStart(2, "0")}` || periods.has(row.id) || (expectedMonth !== undefined && expectedMonth !== row.month)) throw new Error("BILAN_REGISTRY_INVALID");
    periods.add(row.id);
    if (definitions.some(other => other !== row && other.prefix === row.prefix && other.year === row.year)) throw new Error("BILAN_REGISTRY_INVALID");
    if (definitions.some(other => other !== row && other.year === row.year && (other.prefix.startsWith(row.prefix) || row.prefix.startsWith(other.prefix)))) throw new Error("BILAN_REGISTRY_INVALID");
  }
}

const MONTH_BY_PREFIX = Object.freeze({ JA: 1, FE: 2, MR: 3, AV: 4, MA: 5, JN: 6, JL: 7, AT: 8, SE: 9, OT: 10, NV: 11, DC: 12 });
