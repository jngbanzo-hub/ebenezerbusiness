import { normalizeStockageAgency, StockageContractError, type StockageAgency } from "./contracts";

export type ManifestWeightOccurrence = Readonly<{
  trackingCode: string;
  destinationAgency: string;
  weightKg: number | null;
  sourceReference: string;
}>;

export type PaymentWeightSnapshot = Readonly<{
  trackingCode: string;
  destinationAgency: string;
  weightKg: number | null;
}>;

export type ResolvedCanonicalWeight = Readonly<{
  trackingCode: string;
  destinationAgency: StockageAgency;
  weightKg: number;
  source: "SHIPPING_MANIFEST";
  sourceReferences: readonly string[];
  paymentSnapshotChecked: boolean;
}>;

export function resolveCanonicalParcelWeight(input: Readonly<{
  trackingCode: string;
  actorAgency: string;
  manifestOccurrences: readonly ManifestWeightOccurrence[];
  paymentSnapshots: readonly PaymentWeightSnapshot[];
}>): ResolvedCanonicalWeight {
  const trackingCode = normalizeTrackingCode(input.trackingCode);
  const actorAgency = normalizeStockageAgency(input.actorAgency);
  const occurrences = input.manifestOccurrences.filter(
    (entry) => normalizeTrackingCode(entry.trackingCode) === trackingCode,
  );
  if (occurrences.length === 0) {
    throw new StockageContractError("PARCEL_NOT_FOUND", "Colis introuvable dans la source canonique.");
  }
  const destinations = occurrences.map((entry) => normalizeStockageAgency(entry.destinationAgency));
  if (destinations.some((destination) => destination !== actorAgency)) {
    throw new StockageContractError("PARCEL_AGENCY_MISMATCH", "Destination incohérente.");
  }
  const weights = occurrences.map((entry) => requirePositiveWeight(entry.weightKg));
  const distinctWeights = new Set(weights.map(canonicalWeightKey));
  if (distinctWeights.size !== 1) {
    throw new StockageContractError("PARCEL_WEIGHT_AMBIGUOUS", "Poids canonique ambigu.");
  }
  const weightKg = weights[0];
  const paymentSnapshots = input.paymentSnapshots.filter(
    (entry) => normalizeTrackingCode(entry.trackingCode) === trackingCode,
  );
  for (const snapshot of paymentSnapshots) {
    const snapshotAgency = normalizeStockageAgency(snapshot.destinationAgency);
    const snapshotWeight = requirePositiveWeight(snapshot.weightKg);
    if (snapshotAgency !== actorAgency || canonicalWeightKey(snapshotWeight) !== canonicalWeightKey(weightKg)) {
      throw new StockageContractError("PARCEL_WEIGHT_CONFLICT", "Contrôle secondaire incohérent.");
    }
  }
  return Object.freeze({
    trackingCode,
    destinationAgency: actorAgency,
    weightKg,
    source: "SHIPPING_MANIFEST",
    sourceReferences: Object.freeze(occurrences.map((entry) => entry.sourceReference)),
    paymentSnapshotChecked: paymentSnapshots.length > 0,
  });
}

function normalizeTrackingCode(value: string): string {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(normalized)) {
    throw new StockageContractError("INVALID_TRACKING_CODE", "Code colis invalide.");
  }
  return normalized;
}

function requirePositiveWeight(value: number | null): number {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    throw new StockageContractError("PARCEL_WEIGHT_UNAVAILABLE", "Poids canonique indisponible.");
  }
  return value;
}

function canonicalWeightKey(value: number): string {
  return value.toFixed(3);
}
