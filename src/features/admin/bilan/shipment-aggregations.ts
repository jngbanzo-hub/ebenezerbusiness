import type { CohortId, ShipmentParcel } from "./bilan-contracts";
import type { AggregatedQualityIssue, CohortDirectCost, CohortShipmentSummary } from "./bilan-aggregation-contracts";
import type { BilanOfficialTransitRow, BilanShipment } from "./bilan-readers-contracts";
import { allocateUsdByWeight, usdToCents } from "./allocations";
import { declarantGroupCostUsd, transitFihLshiTotalUsd } from "./direct-costs";
import { deduplicateShipmentParcels } from "./shipment-groups";
import type { ShipmentTransitMatch } from "./manifest-readers";

export function aggregateCohortShipment(
  shipments: readonly BilanShipment[], cohortId: CohortId, registeredWeightKg: number
): CohortShipmentSummary {
  const anomalies: AggregatedQualityIssue[] = [];
  let certifiedShippedWeightKg = 0;
  for (const shipment of shipments) for (const group of shipment.groups) {
    const deduplicated = deduplicateShipmentParcels(group);
    anomalies.push(...deduplicated.anomalies.map((item) => issue(item.code, item.source, item.identity, shipment.destination, cohortId, "Poids expédié certifié affecté.")));
    certifiedShippedWeightKg += sum(deduplicated.parcels.filter((parcel) => parcelCohort(parcel) === cohortId).map(({ weightKg }) => weightKg));
  }
  certifiedShippedWeightKg = money(certifiedShippedWeightKg);
  return Object.freeze({ cohortId, registeredWeightKg, certifiedShippedWeightKg, remainingWeightKg: money(registeredWeightKg - certifiedShippedWeightKg), anomalies: Object.freeze(anomalies) });
}

export function calculateDeclarantDirectCosts(shipments: readonly BilanShipment[]): readonly CohortDirectCost[] {
  const costs: CohortDirectCost[] = [];
  for (const shipment of shipments) for (const group of shipment.groups) {
    const parcels = deduplicateShipmentParcels(group).parcels;
    const weights = weightsByCohort(parcels.filter((parcel) => shipment.destination !== "FIH" || parcel.identity.agency === "FIH"));
    if (!weights.length) continue;
    const sourceReference = group.identityKey;
    if (shipment.destination === "LSHI" && shipment.company !== "DHL") {
      costs.push(...allocateCost("DECLARANT_LSHI_GROUP", 58, weights, sourceReference));
    } else if (shipment.destination === "FIH" && shipment.company === "DHL") {
      for (const entry of weights) costs.push(certifiedCost("DECLARANT_FIH_DHL_WEIGHT", entry.key as CohortId, declarantGroupCostUsd("FIH", "DHL", entry.weightKg), sourceReference));
    } else if (shipment.destination === "FIH") {
      costs.push(...allocateCost("DECLARANT_FIH_STANDARD_GROUP", 40, weights, sourceReference));
    }
  }
  return Object.freeze(costs);
}

export function calculateLshiDhlDeclarantDirectCosts(matches: readonly ShipmentTransitMatch[]): readonly CohortDirectCost[] {
  const costs: CohortDirectCost[] = [];
  for (const match of matches) {
    const totalUsd = declarantGroupCostUsd("LSHI", "DHL", match.official.officialWeightKg);
    const parcels = match.shipment.groups.flatMap((group) => deduplicateShipmentParcels(group).parcels);
    const weights = weightsByCohort(parcels);
    const sourceReference = `${match.official.sourceSheet}!${match.official.sourceRow}`;
    if (!weights.length) {
      costs.push(Object.freeze({ kind: "DECLARANT_LSHI_DHL_WEIGHT", cohortId: null, amountCents: usdToCents(totalUsd), status: "NON IMPUTÉ", sourceReference }));
      continue;
    }
    costs.push(...allocateCost("DECLARANT_LSHI_DHL_WEIGHT", totalUsd, weights, sourceReference));
  }
  return Object.freeze(costs);
}

export function calculateTransitDirectCosts(matches: readonly ShipmentTransitMatch[]): readonly CohortDirectCost[] {
  const costs: CohortDirectCost[] = [];
  for (const match of matches) {
    const totalUsd = transitFihLshiTotalUsd({ company: match.official.company, destination: match.official.destination, officialWeightKg: match.official.officialWeightKg });
    const parcels = match.shipment.groups.flatMap((group) => deduplicateShipmentParcels(group).parcels);
    const weights = weightsByCohort(parcels);
    const sourceReference = `${match.official.sourceSheet}!${match.official.sourceRow}`;
    if (!weights.length) {
      costs.push(Object.freeze({ kind: "TRANSIT_FIH_LSHI", cohortId: null, amountCents: usdToCents(totalUsd), status: "NON IMPUTÉ", sourceReference }));
      continue;
    }
    costs.push(...allocateCost("TRANSIT_FIH_LSHI", totalUsd, weights, sourceReference));
  }
  return Object.freeze(costs);
}

export function summarizeOfficialTransit(rows: readonly BilanOfficialTransitRow[]) {
  return Object.freeze({ shipments: rows.length, officialWeightKg: sum(rows.map((row) => row.officialWeightKg)), amountUsd: money(sum(rows.map((row) => transitFihLshiTotalUsd({ company: row.company, destination: row.destination, officialWeightKg: row.officialWeightKg })))) });
}

export function summarizeShipmentStructure(shipments: readonly BilanShipment[], cohortId: CohortId) {
  const byAgency = Object.fromEntries((["FIH", "LSHI", "KLZ"] as const).map((agency) => [agency, { groupages: 0, monoCohort: 0, multiCohort: 0, repetitions: 0, weightConflicts: 0 }]));
  for (const shipment of shipments) for (const group of shipment.groups) {
    const cohorts = new Set(group.parcels.flatMap((parcel) => parcel.identity.cohort.state === "RESOLVED" ? [parcel.identity.cohort.definition.id] : []));
    if (!cohorts.has(cohortId)) continue;
    const summary = byAgency[shipment.destination];
    summary.groupages += 1;
    if (cohorts.size === 1) summary.monoCohort += 1;
    else summary.multiCohort += 1;
    for (const anomaly of deduplicateShipmentParcels(group).anomalies) {
      if (anomaly.code === "IDENTITE_CONFLICTUELLE") summary.repetitions += 1;
      if (anomaly.code === "POIDS_DIVERGENT") summary.weightConflicts += 1;
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(byAgency).map(([agency, summary]) => [agency, Object.freeze(summary)])));
}

function allocateCost(kind: CohortDirectCost["kind"], totalUsd: number, weights: readonly { key: string; weightKg: number }[], sourceReference: string) {
  return allocateUsdByWeight(totalUsd, weights).map((allocation) => Object.freeze({ kind, cohortId: allocation.key as CohortId, amountCents: allocation.amountCents, status: "CERTIFIÉ" as const, sourceReference }));
}
function certifiedCost(kind: CohortDirectCost["kind"], cohortId: CohortId, amountUsd: number, sourceReference: string): CohortDirectCost { return Object.freeze({ kind, cohortId, amountCents: usdToCents(amountUsd), status: "CERTIFIÉ", sourceReference }); }
function weightsByCohort(parcels: readonly ShipmentParcel[]) {
  const weights = new Map<CohortId, number>();
  for (const parcel of parcels) if (parcel.identity.cohort.state === "RESOLVED") weights.set(parcel.identity.cohort.definition.id, (weights.get(parcel.identity.cohort.definition.id) ?? 0) + parcel.weightKg);
  return Array.from(weights, ([key, weightKg]) => ({ key, weightKg }));
}
function parcelCohort(parcel: ShipmentParcel) { return parcel.identity.cohort.state === "RESOLVED" ? parcel.identity.cohort.definition.id : null; }
function sum(values: readonly number[]) { return values.reduce((total, value) => total + value, 0); }
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function issue(type: string, source: string, reference: string, agency: string | null, cohortId: CohortId | null, impact: string): AggregatedQualityIssue { return Object.freeze({ type, source, reference, agency, cohortId, impact }); }
