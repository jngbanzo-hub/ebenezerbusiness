import type { BilanAgency, CohortId } from "./bilan-contracts";
import type { AgencyCohortActivity, AggregatedQualityIssue, CohortActivity } from "./bilan-aggregation-contracts";
import type { BilanManifestParcel } from "./bilan-readers-contracts";
import { resolveCohort } from "./cohort-registry";

const AGENCIES = ["FIH", "LSHI", "KLZ"] as const;

export function aggregateCohortActivity(
  rows: readonly BilanManifestParcel[],
  cohortId: CohortId,
  period: Readonly<{ from: string; to: string }> | null
): CohortActivity {
  const anomalies: AggregatedQualityIssue[] = [];
  const periodWeightKg = period ? sum(rows.filter((row) => inPeriod(row.date, period)).map((row) => row.weightKg)) : null;
  const cohortRows = rows.filter((row) => resolvedCohortId(row.code) === cohortId);
  const agencies = Object.fromEntries(AGENCIES.map((agency) => {
    const agencyRows = cohortRows.filter((row) => analyticalAgency(row) === agency);
    const certified = certifyIdentities(agencyRows, cohortId, anomalies);
    return [agency, Object.freeze({
      agency,
      occurrences: agencyRows.length,
      certifiedUniqueIdentities: certified.length,
      registeredWeightKg: sum(certified.map((row) => row.weightKg)),
      cohortWeightKg: sum(certified.map((row) => row.weightKg))
    }) satisfies AgencyCohortActivity];
  })) as Record<BilanAgency, AgencyCohortActivity>;
  const cohortWeightKg = sum(Object.values(agencies).map((row) => row.cohortWeightKg));
  return Object.freeze({
    cohortId,
    period,
    agencies: Object.freeze(agencies),
    periodWeightKg,
    cohortWeightKg,
    scopeDifferenceKg: periodWeightKg === null ? null : money(periodWeightKg - cohortWeightKg),
    anomalies: Object.freeze(anomalies)
  });
}

function certifyIdentities(rows: readonly BilanManifestParcel[], cohortId: CohortId, anomalies: AggregatedQualityIssue[]) {
  const grouped = new Map<string, BilanManifestParcel[]>();
  for (const row of rows) {
    const key = `${analyticalAgency(row)}|${row.code}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return Array.from(grouped.entries()).flatMap(([key, occurrences]) => {
    const weights = new Set(occurrences.map(({ weightKg }) => weightKg));
    if (weights.size > 1) {
      anomalies.push(issue("POIDS_DIVERGENT", "MANIFESTE D’EXPÉDITION COO", key, occurrences[0].agency, cohortId, "Identité exclue du poids certifié."));
      return [];
    }
    return [occurrences[0]];
  });
}

function analyticalAgency(row: BilanManifestParcel): BilanAgency { return row.code.endsWith("KLZ") ? "KLZ" : row.agency; }
function resolvedCohortId(code: string) { const cohort = resolveCohort(code); return cohort.state === "RESOLVED" ? cohort.definition.id : null; }
function inPeriod(date: string, period: { from: string; to: string }) { return date >= period.from && date <= period.to; }
function sum(values: readonly number[]) { return money(values.reduce((total, value) => total + value, 0)); }
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function issue(type: string, source: string, reference: string, agency: string | null, cohortId: CohortId | null, impact: string): AggregatedQualityIssue { return Object.freeze({ type, source, reference, agency, cohortId, impact }); }
