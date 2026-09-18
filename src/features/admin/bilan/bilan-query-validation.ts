import type { CohortDefinition } from "./bilan-contracts";
import { monthPeriod, resolveCatalogCohort } from "./cohort-catalog";

export const BILAN_ALLOWED_METHODS = Object.freeze(["GET"] as const);

export type BilanApiQuery = Readonly<{
  cohort: CohortDefinition;
  period: Readonly<{ from: string; to: string }> | null;
}>;

export type BilanQueryResult =
  | Readonly<{ state: "VALID"; query: BilanApiQuery }>
  | Readonly<{ state: "COHORTE_NON_RESOLUE"; requested: string }>
  | Readonly<{ state: "INVALID"; message: string }>;

export function parseBilanQuery(url: string, definitions: readonly CohortDefinition[]): BilanQueryResult {
  const params = new URL(url).searchParams;
  const allowed = new Set(["cohort", "cohortId", "year", "month", "startDate", "endDate", "periodMode"]);
  if (Array.from(params.keys()).some((key) => !allowed.has(key))) return { state: "INVALID", message: "Paramètre inconnu." };
  if (Array.from(params.keys()).some((key) => params.getAll(key).length !== 1)) return { state: "INVALID", message: "Paramètre répété." };
  const prefix = (params.get("cohort") ?? "").trim().toUpperCase();
  const cohortId = (params.get("cohortId") ?? "").trim();
  const year = (params.get("year") ?? "").trim();
  const month = (params.get("month") ?? "").trim();
  if ((prefix || cohortId) && (year || month)) return { state: "INVALID", message: "Utiliser une identité de cohorte ou année+mois, jamais les deux." };
  let cohort: CohortDefinition | undefined;
  if (cohortId) {
    cohort = definitions.find((candidate) => candidate.id === cohortId);
    if (!cohort) return { state: "COHORTE_NON_RESOLUE", requested: cohortId };
  } else if (prefix) {
    const resolution = resolveCatalogCohort(prefix, definitions);
    if (resolution.state !== "RESOLVED" || resolution.definition.prefix !== prefix) return { state: "COHORTE_NON_RESOLUE", requested: prefix };
    cohort = resolution.definition;
  } else {
    if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) return { state: "INVALID", message: "Cohorte ou année et mois obligatoires." };
    const monthNumber = Number(month);
    if (monthNumber < 1 || monthNumber > 12) return { state: "INVALID", message: "Mois invalide." };
    cohort = definitions.find((candidate) => candidate.year === Number(year) && candidate.month === monthNumber);
    if (!cohort) return { state: "COHORTE_NON_RESOLUE", requested: `${year}-${String(monthNumber).padStart(2, "0")}` };
  }
  const startDate = (params.get("startDate") ?? "").trim();
  const endDate = (params.get("endDate") ?? "").trim();
  const mode = params.get("periodMode") ?? "MONTH";
  if (mode !== "MONTH" && mode !== "CUSTOM") return { state: "INVALID", message: "Mode de période invalide." };
  if (Boolean(startDate) !== Boolean(endDate)) return { state: "INVALID", message: "startDate et endDate doivent être fournis ensemble." };
  if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate)) || (startDate && endDate && startDate > endDate)) return { state: "INVALID", message: "Période invalide." };
  const monthly = monthPeriod(cohort.year, cohort.month);
  if (mode === "MONTH" && startDate && (startDate !== monthly.from || endDate !== monthly.to)) {
    return { state: "INVALID", message: "La période mensuelle doit correspondre au mois d’origine sélectionné." };
  }
  if (mode === "CUSTOM" && (!startDate || !endDate || startDate < monthly.from || endDate > monthly.to)) {
    return { state: "INVALID", message: "Les dates personnalisées doivent rester dans le mois d’origine sélectionné." };
  }
  return Object.freeze({ state: "VALID", query: Object.freeze({ cohort, period: Object.freeze(startDate ? { from: startDate, to: endDate } : monthly) }) });
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
