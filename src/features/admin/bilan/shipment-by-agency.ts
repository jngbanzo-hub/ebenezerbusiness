import type { BilanAgency, CohortId, ShipmentParcel } from "./bilan-contracts";
import type { AggregatedQualityIssue } from "./bilan-aggregation-contracts";
import type { BilanManifestParcel, BilanShipment } from "./bilan-readers-contracts";
import { resolveCohort } from "./cohort-registry";
import { deduplicateShipmentParcels } from "./shipment-groups";
import {
  findPdgCertifiedIdentityCorrection,
  PDG_CERTIFIED_IDENTITY_CORRECTION
} from "./pdg-certified-identity-corrections";

export const SHIPMENT_AGENCY_STATUSES = ["CERTIFIED", "PARTIAL", "NOT_CALCULABLE"] as const;
export type ShipmentAgencyStatus = (typeof SHIPMENT_AGENCY_STATUSES)[number];

export type ShipmentIdentityProjection = Readonly<{
  sourceRawCode: string;
  shipmentRawCode: string;
  canonicalParcelCode: string;
  agency: BilanAgency;
  resolutionType: "EXACT" | "KLZ_SUFFIX_PROJECTION" | typeof PDG_CERTIFIED_IDENTITY_CORRECTION;
}>;

export type ShipmentAgencyAnomaly = Readonly<{
  type: "NON_RETROUVE" | "EXPEDIE_SANS_SOURCE" | "POIDS_DIVERGENT" | "DOUBLON" | "COLLISION";
  sourceRawCode: string | null;
  shipmentRawCode: string | null;
  sourceReference: string | null;
  shipmentReferences: readonly string[];
  registeredWeightKg: number | null;
  shipmentWeightsKg: readonly number[];
}>;

export type ShipmentAgencySummary = Readonly<{
  registeredWeightKg: number;
  certifiedShippedWeightKg: number;
  remainingWeightKg: number;
  status: ShipmentAgencyStatus;
  anomalies: readonly ShipmentAgencyAnomaly[];
  certifiedIdentities: readonly ShipmentIdentityProjection[];
}>;

export type ShipmentByAgencySummary = Readonly<{
  FIH: ShipmentAgencySummary;
  LSHI: ShipmentAgencySummary;
  KLZ: ShipmentAgencySummary;
  total: Readonly<{
    registeredWeightKg: number;
    certifiedShippedWeightKg: number;
    remainingWeightKg: number;
    status: ShipmentAgencyStatus;
    anomalies: readonly ShipmentAgencyAnomaly[];
  }>;
  qualityIssues: readonly AggregatedQualityIssue[];
}>;

type RegisteredIdentity = Readonly<{
  code: string;
  rawCode: string;
  agency: BilanAgency;
  weightKg: number;
  sourceReference: string;
}>;

type ShipmentOccurrence = Readonly<{
  parcel: ShipmentParcel;
  groupKey: string;
  sourceReference: string;
}>;

const AGENCIES = ["FIH", "LSHI", "KLZ"] as const;

export function aggregateShipmentByAgency(
  manifestRows: readonly BilanManifestParcel[],
  shipments: readonly BilanShipment[],
  cohortId: CohortId
): ShipmentByAgencySummary {
  const registered = registeredIdentities(manifestRows, cohortId);
  const shipped = shipmentOccurrences(shipments, cohortId);
  const groupAnomalies = shipmentGroupAnomalies(shipments, cohortId);
  const consumedShipmentKeys = new Set<string>();

  const byAgency = Object.fromEntries(AGENCIES.map((agency) => {
    const anomalies: ShipmentAgencyAnomaly[] = [...(groupAnomalies.get(agency) ?? [])];
    const projections: ShipmentIdentityProjection[] = [];
    let registeredWeightKg = 0;
    let certifiedShippedWeightKg = 0;

    for (const source of Array.from(registered.values())) {
      if (source.agency !== agency) continue;
      registeredWeightKg += source.weightKg;
      const exactKey = identityKey(cohortId, agency, source.code);
      const projectedCode = agency === "KLZ" ? `${source.code}KLZ` : null;
      const projectedKey = projectedCode ? identityKey(cohortId, agency, projectedCode) : null;
      const exact = shipped.get(exactKey) ?? [];
      const projected = projectedKey ? shipped.get(projectedKey) ?? [] : [];
      const certifiedCorrection = findPdgCertifiedIdentityCorrection(cohortId, agency, source.rawCode);
      const correctedKey = certifiedCorrection
        ? identityKey(cohortId, agency, certifiedCorrection.shipmentRawCode)
        : null;
      const corrected = correctedKey ? shipped.get(correctedKey) ?? [] : [];

      const populatedCandidates = [exact, projected, corrected].filter((matches) => matches.length);
      if (populatedCandidates.length > 1) {
        anomalies.push(anomaly("COLLISION", source, corrected.length ? certifiedCorrection?.shipmentRawCode ?? null : projectedCode, populatedCandidates.flat()));
        continue;
      }

      const matches = exact.length ? exact : projected.length ? projected : corrected;
      const shipmentRawCode = exact.length
        ? source.code
        : projected.length
          ? projectedCode
          : corrected.length
            ? certifiedCorrection?.shipmentRawCode ?? null
            : null;
      if (!matches.length || !shipmentRawCode) {
        // A valid registered parcel with no shipment occurrence is legitimate
        // remaining stock. Its weight stays in remainingWeightKg and is not a
        // data-quality anomaly.
        continue;
      }

      const groupKeys = new Set(matches.map((match) => match.groupKey));
      if (groupKeys.size > 1) {
        anomalies.push(anomaly("DOUBLON", source, shipmentRawCode, matches));
        continue;
      }

      const weights = new Set(matches.map((match) => match.parcel.weightKg));
      if (weights.size !== 1 || !weights.has(source.weightKg)) {
        anomalies.push(anomaly("POIDS_DIVERGENT", source, shipmentRawCode, matches));
        continue;
      }

      certifiedShippedWeightKg += source.weightKg;
      consumedShipmentKeys.add(identityKey(cohortId, agency, shipmentRawCode));
      projections.push(Object.freeze({
        sourceRawCode: source.rawCode,
        shipmentRawCode: matches[0].parcel.identity.rawCode,
        canonicalParcelCode: source.code,
        agency,
        resolutionType: corrected.length
          ? PDG_CERTIFIED_IDENTITY_CORRECTION
          : projected.length
            ? "KLZ_SUFFIX_PROJECTION"
            : "EXACT"
      }));
    }

    for (const [key, occurrences] of Array.from(shipped.entries())) {
      if (shipmentKeyAgency(key) !== agency || consumedShipmentKeys.has(key)) continue;
      if (matchesAnyRegisteredSource(key, occurrences[0].parcel.identity.rawCode, agency, cohortId, registered)) continue;
      anomalies.push(Object.freeze({
        type: "EXPEDIE_SANS_SOURCE",
        sourceRawCode: null,
        shipmentRawCode: occurrences[0].parcel.identity.rawCode,
        sourceReference: null,
        shipmentReferences: Object.freeze(occurrences.map((entry) => entry.sourceReference)),
        registeredWeightKg: null,
        shipmentWeightsKg: Object.freeze(unique(occurrences.map((entry) => entry.parcel.weightKg)))
      }));
    }

    registeredWeightKg = round(registeredWeightKg);
    certifiedShippedWeightKg = round(certifiedShippedWeightKg);
    return [agency, Object.freeze({
      registeredWeightKg,
      certifiedShippedWeightKg,
      remainingWeightKg: round(registeredWeightKg - certifiedShippedWeightKg),
      status: statusFor(registeredWeightKg, anomalies),
      anomalies: Object.freeze(anomalies),
      certifiedIdentities: Object.freeze(projections)
    }) satisfies ShipmentAgencySummary];
  })) as Record<BilanAgency, ShipmentAgencySummary>;

  const allAnomalies = AGENCIES.flatMap((agency) => byAgency[agency].anomalies);
  const total = Object.freeze({
    registeredWeightKg: round(sum(AGENCIES.map((agency) => byAgency[agency].registeredWeightKg))),
    certifiedShippedWeightKg: round(sum(AGENCIES.map((agency) => byAgency[agency].certifiedShippedWeightKg))),
    remainingWeightKg: round(sum(AGENCIES.map((agency) => byAgency[agency].remainingWeightKg))),
    status: overallStatus(AGENCIES.map((agency) => byAgency[agency].status)),
    anomalies: Object.freeze(allAnomalies)
  });
  return Object.freeze({
    ...byAgency,
    total,
    qualityIssues: Object.freeze(AGENCIES.flatMap((agency) => byAgency[agency].anomalies.map((entry) => qualityIssue(entry, agency, cohortId))))
  });
}

function registeredIdentities(rows: readonly BilanManifestParcel[], cohortId: CohortId) {
  const grouped = new Map<string, BilanManifestParcel[]>();
  for (const row of rows) {
    if (cohortOf(row.code) !== cohortId) continue;
    const agency = row.sourceSheet;
    const key = identityKey(cohortId, agency, row.code);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const result = new Map<string, RegisteredIdentity>();
  for (const [key, occurrences] of Array.from(grouped.entries())) {
    const weights = unique(occurrences.map((row) => row.weightKg));
    if (weights.length !== 1) continue;
    const row = occurrences[0];
    result.set(key, Object.freeze({ code: row.code, rawCode: row.rawCode, agency: row.sourceSheet, weightKg: row.weightKg, sourceReference: `${row.sourceSheet}!${row.sourceRow}` }));
  }
  return result;
}

function shipmentOccurrences(shipments: readonly BilanShipment[], cohortId: CohortId) {
  const result = new Map<string, ShipmentOccurrence[]>();
  for (const shipment of shipments) for (const group of shipment.groups) {
    for (const parcel of deduplicateShipmentParcels(group).parcels) {
      if (cohortOf(parcel.identity.canonicalCode) !== cohortId) continue;
      const key = identityKey(cohortId, parcel.identity.agency, parcel.identity.canonicalCode);
      const occurrence = Object.freeze({ parcel, groupKey: group.identityKey, sourceReference: `${shipment.sourceSheet}!${shipment.sourceRow}` });
      result.set(key, [...(result.get(key) ?? []), occurrence]);
    }
  }
  return result;
}

function shipmentGroupAnomalies(shipments: readonly BilanShipment[], cohortId: CohortId) {
  const result = new Map<BilanAgency, ShipmentAgencyAnomaly[]>();
  for (const shipment of shipments) for (const group of shipment.groups) {
    for (const entry of deduplicateShipmentParcels(group).anomalies) {
      const parts = entry.identity.split("|");
      const anomalyCohort = parts.at(-3);
      const agency = parts.at(-2) as BilanAgency | undefined;
      const shipmentRawCode = parts.at(-1) ?? null;
      if (anomalyCohort !== cohortId || !agency || !AGENCIES.includes(agency)) continue;
      const firstWeight = typeof entry.details?.firstWeightKg === "number" ? entry.details.firstWeightKg : null;
      const secondWeight = typeof entry.details?.secondWeightKg === "number" ? entry.details.secondWeightKg : null;
      const repeatedWeight = typeof entry.details?.weightKg === "number" ? entry.details.weightKg : null;
      const weights = firstWeight === null ? repeatedWeight === null ? [] : [repeatedWeight] : secondWeight === null ? [firstWeight] : [firstWeight, secondWeight];
      const anomaly: ShipmentAgencyAnomaly = Object.freeze({
        type: entry.code === "POIDS_DIVERGENT" ? "POIDS_DIVERGENT" : "DOUBLON",
        sourceRawCode: null,
        shipmentRawCode,
        sourceReference: null,
        shipmentReferences: Object.freeze([entry.source]),
        registeredWeightKg: null,
        shipmentWeightsKg: Object.freeze(weights)
      });
      result.set(agency, [...(result.get(agency) ?? []), anomaly]);
    }
  }
  return result;
}

function matchesAnyRegisteredSource(key: string, rawCode: string, agency: BilanAgency, cohortId: CohortId, registered: ReadonlyMap<string, RegisteredIdentity>) {
  if (registered.has(key)) return true;
  if (agency !== "KLZ" || !rawCode.endsWith("KLZ")) return false;
  return registered.has(identityKey(cohortId, "KLZ", rawCode.slice(0, -3)));
}

function anomaly(type: ShipmentAgencyAnomaly["type"], source: RegisteredIdentity, shipmentRawCode: string | null, matches: readonly ShipmentOccurrence[]): ShipmentAgencyAnomaly {
  return Object.freeze({
    type,
    sourceRawCode: source.rawCode,
    shipmentRawCode,
    sourceReference: source.sourceReference,
    shipmentReferences: Object.freeze(matches.map((match) => match.sourceReference)),
    registeredWeightKg: source.weightKg,
    shipmentWeightsKg: Object.freeze(unique(matches.map((match) => match.parcel.weightKg)))
  });
}

function qualityIssue(entry: ShipmentAgencyAnomaly, agency: BilanAgency, cohortId: CohortId): AggregatedQualityIssue {
  return Object.freeze({
    type: entry.type,
    source: "MANIFESTE D’EXPÉDITION COO",
    reference: entry.sourceReference ?? entry.shipmentReferences.join(", "),
    agency,
    cohortId,
    impact: "Ventilation des kg expédiés/restants partielle ; aucune valeur ambiguë n’est certifiée."
  });
}

function statusFor(registeredWeightKg: number, anomalies: readonly ShipmentAgencyAnomaly[]): ShipmentAgencyStatus {
  const blocking = anomalies.some((entry) => entry.type !== "NON_RETROUVE");
  if (!registeredWeightKg && blocking) return "NOT_CALCULABLE";
  return blocking ? "PARTIAL" : "CERTIFIED";
}

function overallStatus(statuses: readonly ShipmentAgencyStatus[]): ShipmentAgencyStatus {
  if (statuses.every((status) => status === "CERTIFIED")) return "CERTIFIED";
  if (statuses.every((status) => status === "NOT_CALCULABLE")) return "NOT_CALCULABLE";
  return "PARTIAL";
}

function cohortOf(code: string) {
  const cohort = resolveCohort(code);
  return cohort.state === "RESOLVED" ? cohort.definition.id : null;
}
function identityKey(cohortId: CohortId, agency: BilanAgency, code: string) { return `${cohortId}|${agency}|${code}`; }
function shipmentKeyAgency(key: string) { return key.split("|")[1] as BilanAgency; }
function unique(values: readonly number[]) { return Array.from(new Set(values)); }
function sum(values: readonly number[]) { return values.reduce((total, value) => total + value, 0); }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
