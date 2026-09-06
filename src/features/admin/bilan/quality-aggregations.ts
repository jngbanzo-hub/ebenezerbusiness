import type { CohortId } from "./bilan-contracts";
import type { AggregatedQualityIssue } from "./bilan-aggregation-contracts";
import type { BilanReadAnomaly } from "./bilan-readers-contracts";

export function aggregateReadAnomalies(
  anomalies: readonly BilanReadAnomaly[],
  context: Readonly<{ agency?: string; cohortId?: CohortId; impact: string }>
): readonly AggregatedQualityIssue[] {
  return Object.freeze(anomalies.map((anomaly) => Object.freeze({
    type: anomaly.code,
    source: anomaly.source,
    reference: anomaly.rowNumber ? `${anomaly.source}!${anomaly.rowNumber}` : anomaly.source,
    agency: context.agency ?? null,
    cohortId: context.cohortId ?? null,
    impact: context.impact
  })));
}
