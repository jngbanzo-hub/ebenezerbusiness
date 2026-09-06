import type { CohortDefinition } from "./bilan-contracts";
import { BILAN_COHORTS, resolveCohort } from "./cohort-registry";

export const BILAN_ALLOWED_METHODS = Object.freeze(["GET"] as const);

export type BilanApiQuery = Readonly<{
  cohort: CohortDefinition;
  period: Readonly<{ from: string; to: string }> | null;
}>;

export type BilanQueryResult =
  | Readonly<{ state: "VALID"; query: BilanApiQuery }>
  | Readonly<{ state: "COHORTE_NON_RESOLUE"; requested: string }>
  | Readonly<{ state: "INVALID"; message: string }>;

export function parseBilanApiQuery(url: string): BilanQueryResult {
  const params = new URL(url).searchParams;
  const allowed = new Set(["cohort", "year", "month", "startDate", "endDate"]);
  if (Array.from(params.keys()).some((key) => !allowed.has(key))) return { state: "INVALID", message: "Paramètre inconnu." };
  const prefix = (params.get("cohort") ?? "").trim().toUpperCase();
  const year = (params.get("year") ?? "").trim();
  const month = (params.get("month") ?? "").trim();
  if (prefix && (year || month)) return { state: "INVALID", message: "Utiliser cohort ou year+month, jamais les deux." };
  let cohort: CohortDefinition | undefined;
  if (prefix) {
    const resolution = resolveCohort(prefix);
    if (resolution.state !== "RESOLVED" || resolution.definition.prefix !== prefix) return { state: "COHORTE_NON_RESOLUE", requested: prefix };
    cohort = resolution.definition;
  } else {
    if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) return { state: "INVALID", message: "Cohorte ou année et mois obligatoires." };
    const monthNumber = Number(month);
    if (monthNumber < 1 || monthNumber > 12) return { state: "INVALID", message: "Mois invalide." };
    cohort = BILAN_COHORTS.find((candidate) => candidate.year === Number(year) && candidate.month === monthNumber);
    if (!cohort) return { state: "COHORTE_NON_RESOLUE", requested: `${year}-${String(monthNumber).padStart(2, "0")}` };
  }
  const startDate = (params.get("startDate") ?? "").trim();
  const endDate = (params.get("endDate") ?? "").trim();
  if (Boolean(startDate) !== Boolean(endDate)) return { state: "INVALID", message: "startDate et endDate doivent être fournis ensemble." };
  if ((startDate && !validDate(startDate)) || (endDate && !validDate(endDate)) || (startDate && endDate && startDate > endDate)) return { state: "INVALID", message: "Période invalide." };
  return Object.freeze({ state: "VALID", query: Object.freeze({ cohort, period: startDate ? Object.freeze({ from: startDate, to: endDate }) : null }) });
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
