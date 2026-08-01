import assert from "node:assert/strict";
import test from "node:test";

import { StockageContractError } from "./contracts";
import {
  resolveCanonicalParcelWeight,
  type ManifestWeightOccurrence,
  type PaymentWeightSnapshot,
} from "./weight-source";

const occurrence = (overrides: Partial<ManifestWeightOccurrence> = {}): ManifestWeightOccurrence => ({
  trackingCode: "JL114826B",
  destinationAgency: "LSHI",
  weightKg: 4.5,
  sourceReference: "LSHI:42",
  ...overrides,
});

const resolve = (
  manifestOccurrences: readonly ManifestWeightOccurrence[],
  paymentSnapshots: readonly PaymentWeightSnapshot[] = [],
) =>
  resolveCanonicalParcelWeight({
    trackingCode: " jl114826b ", actorAgency: "LSHI", manifestOccurrences, paymentSnapshots,
  });

test("résout un poids unique positif sans saisie Agent", () => {
  assert.deepEqual(resolve([occurrence()]), {
    trackingCode: "JL114826B", destinationAgency: "LSHI", weightKg: 4.5,
    source: "SHIPPING_MANIFEST", sourceReferences: ["LSHI:42"], paymentSnapshotChecked: false,
  });
});

test("refuse un colis absent", () => {
  assertCode(() => resolve([]), "PARCEL_NOT_FOUND");
});

test("refuse un poids absent nul ou négatif", () => {
  for (const weightKg of [null, 0, -1]) {
    assertCode(() => resolve([occurrence({ weightKg })]), "PARCEL_WEIGHT_UNAVAILABLE");
  }
});

test("accepte plusieurs occurrences strictement identiques", () => {
  const result = resolve([occurrence(), occurrence({ sourceReference: "LSHI:77" })]);
  assert.equal(result.weightKg, 4.5);
  assert.deepEqual(result.sourceReferences, ["LSHI:42", "LSHI:77"]);
});

test("refuse plusieurs occurrences de poids divergents", () => {
  assertCode(() => resolve([occurrence(), occurrence({ weightKg: 5 })]), "PARCEL_WEIGHT_AMBIGUOUS");
});

test("refuse une destination incohérente", () => {
  assertCode(() => resolve([occurrence({ destinationAgency: "FIH" })]), "PARCEL_AGENCY_MISMATCH");
});

test("accepte un instantané Paiements cohérent comme contrôle secondaire", () => {
  const result = resolve([occurrence()], [{ trackingCode: "JL114826B", destinationAgency: "LSHI", weightKg: 4.5 }]);
  assert.equal(result.paymentSnapshotChecked, true);
});

test("refuse un instantané Paiements divergent sans convertir le poids", () => {
  assertCode(
    () => resolve([occurrence()], [{ trackingCode: "JL114826B", destinationAgency: "LSHI", weightKg: 5 }]),
    "PARCEL_WEIGHT_CONFLICT",
  );
});

test("retourne un résultat profondément protégé", () => {
  const result = resolve([occurrence()]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.sourceReferences), true);
});

function assertCode(action: () => unknown, code: string): void {
  assert.throws(action, (error) => error instanceof StockageContractError && error.code === code);
}
