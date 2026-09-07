import assert from "node:assert/strict";
import test from "node:test";

import type { BilanAgency } from "./bilan-contracts";
import type { BilanManifestParcel, BilanShipment } from "./bilan-readers-contracts";
import { adaptShipmentRows } from "./manifest-readers";
import { aggregateShipmentByAgency } from "./shipment-by-agency";
import { PDG_CERTIFIED_IDENTITY_CORRECTIONS } from "./pdg-certified-identity-corrections";

test("projette exclusivement source KLZ vers source plus suffixe analytique KLZ", () => {
  const result = aggregateShipmentByAgency(
    [manifest("AT12326", 5, "KLZ"), manifest("AT00426B", 4, "KLZ", 3)],
    shipmentRows([["01/09/2026", "DHL", "LSHI", 1, 9, "GROUPAGE 1\nAT12326KLZ : 5kgs\nAT00426BKLZ : 4kgs"]]),
    "2026-08"
  );
  assert.equal(result.KLZ.status, "CERTIFIED");
  assert.deepEqual(result.KLZ.certifiedIdentities, [
    { sourceRawCode: "AT12326", shipmentRawCode: "AT12326KLZ", canonicalParcelCode: "AT12326", agency: "KLZ", resolutionType: "KLZ_SUFFIX_PROJECTION" },
    { sourceRawCode: "AT00426B", shipmentRawCode: "AT00426BKLZ", canonicalParcelCode: "AT00426B", agency: "KLZ", resolutionType: "KLZ_SUFFIX_PROJECTION" }
  ]);
  assert.equal(result.KLZ.certifiedShippedWeightKg, 9);
});

test("ne généralise jamais la projection KLZ aux feuilles FIH ou LSHI", () => {
  const result = aggregateShipmentByAgency(
    [manifest("AT12326", 5, "LSHI")],
    shipmentRows([["01/09/2026", "DHL", "LSHI", 1, 5, "GROUPAGE 1\nAT12326KLZ : 5kgs"]]),
    "2026-08"
  );
  assert.equal(result.LSHI.certifiedShippedWeightKg, 0);
  assert.equal(result.LSHI.remainingWeightKg, 5);
  assert.deepEqual(result.LSHI.anomalies, []);
  assert.equal(result.KLZ.anomalies[0].type, "EXPEDIE_SANS_SOURCE");
});

test("classe 54 colis FIH non expédiés comme reste réel sans NON_RETROUVE", () => {
  const remaining = Array.from({ length: 54 }, (_, index) => manifest(`AT${String(300 + index).padStart(3, "0")}26`, index === 53 ? 33 : 5, "FIH", 1000 + index));
  const result = aggregateShipmentByAgency(
    [manifest("AT00126", 1227, "FIH", 2), ...remaining],
    shipmentRows([["01/09/2026", "DHL", "FIH", 1, 1227, "GROUPAGE 1\nAT00126 : 1227kgs"]]),
    "2026-08"
  );
  assert.deepEqual(pick(result.FIH), { registeredWeightKg: 1525, certifiedShippedWeightKg: 1227, remainingWeightKg: 298, status: "CERTIFIED" });
  assert.equal(result.FIH.anomalies.filter(({ type }) => type === "NON_RETROUVE").length, 0);
  assert.equal(result.qualityIssues.filter(({ type }) => type === "NON_RETROUVE").length, 0);
});

test("refuse collision, multi-groupages et poids divergent sans choisir silencieusement", () => {
  const source = [manifest("AT10026", 2, "KLZ"), manifest("AT10126", 3, "KLZ", 3), manifest("AT10226", 4, "KLZ", 4)];
  const shipments = shipmentRows([
    ["01/08/2026", "DHL", "KLZ", 1, 2, "GROUPAGE 1\nAT10026 : 2kgs"],
    ["01/08/2026", "DHL", "LSHI", 1, 2, "GROUPAGE 6\nAT10026KLZ : 2kgs"],
    ["02/08/2026", "DHL", "LSHI", 1, 3, "GROUPAGE 2\nAT10126KLZ : 3kgs"],
    ["03/08/2026", "DHL", "LSHI", 1, 5, "GROUPAGE 3\nAT10126KLZ : 5kgs"],
    ["04/08/2026", "DHL", "LSHI", 1, 7, "GROUPAGE 4\nAT10226KLZ : 7kgs"]
  ]);
  const result = aggregateShipmentByAgency(source, shipments, "2026-08");
  assert.equal(result.KLZ.certifiedShippedWeightKg, 0);
  assert.deepEqual(result.KLZ.anomalies.filter(({ sourceRawCode }) => sourceRawCode).map(({ type }) => type), ["COLLISION", "DOUBLON", "POIDS_DIVERGENT"]);
  assert.equal(result.KLZ.status, "PARTIAL");
});

test("compte une répétition exacte une fois et conserve l’anomalie d’audit", () => {
  const result = aggregateShipmentByAgency(
    [manifest("AT20026", 5, "LSHI")],
    shipmentRows([["01/08/2026", "DHL", "LSHI", 1, 10, "GROUPAGE 1\nAT20026 : 5kgs\nAT20026 : 5kgs"]]),
    "2026-08"
  );
  assert.equal(result.LSHI.certifiedShippedWeightKg, 5);
  assert.equal(result.LSHI.anomalies.some(({ type }) => type === "DOUBLON"), true);
  assert.equal(result.LSHI.status, "PARTIAL");
});

test("conserve la décision PDG comme trace inactive et priorise la donnée EXPÉDITION corrigée", () => {
  const result = aggregateShipmentByAgency(
    [manifest("AT08026", 4, "KLZ", 731)],
    shipmentRows([["17/08/2026", "ETHIOPIAN", "LSHI", 1, 4, "GROUPAGE 89\nAT08026KLZ : 4kgs"]]),
    "2026-08"
  );
  assert.deepEqual(pick(result.KLZ), { registeredWeightKg: 4, certifiedShippedWeightKg: 4, remainingWeightKg: 0, status: "CERTIFIED" });
  assert.deepEqual(result.KLZ.certifiedIdentities, [{
    sourceRawCode: "AT08026",
    shipmentRawCode: "AT08026KLZ",
    canonicalParcelCode: "AT08026",
    agency: "KLZ",
    resolutionType: "KLZ_SUFFIX_PROJECTION"
  }]);
  assert.deepEqual(result.KLZ.anomalies, []);
  assert.deepEqual(PDG_CERTIFIED_IDENTITY_CORRECTIONS[0], {
    cohortId: "2026-08",
    agency: "KLZ",
    sourceRawCode: "AT08026",
    shipmentRawCode: "AT08036KLZ",
    canonicalParcelCode: "AT08026",
    resolutionType: "PDG_CERTIFIED_IDENTITY_CORRECTION",
    active: false,
    deactivatedReason: "La donnée EXPÉDITION actuelle porte désormais l’identité KLZ correcte AT08026KLZ."
  });
});

test("ne réactive pas l’ancienne correction PDG et ne la généralise pas", () => {
  const result = aggregateShipmentByAgency(
    [manifest("AT08026", 4, "KLZ", 731)],
    shipmentRows([["17/08/2026", "ETHIOPIAN", "LSHI", 1, 4, "GROUPAGE 89\nAT08036KLZ : 4kgs"]]),
    "2026-08"
  );
  assert.equal(result.KLZ.certifiedShippedWeightKg, 0);
  assert.deepEqual(result.KLZ.anomalies.map(({ type }) => type), ["EXPEDIE_SANS_SOURCE"]);
});

test("reproduit la référence historique AT sans activer une résolution PDG obsolète", () => {
  const manifests = [
    manifest("ATF01", 1227, "FIH"), manifest("ATF02", 298, "FIH", 3),
    manifest("ATL01", 5500, "LSHI", 4), manifest("AT24326", 1, "LSHI", 5), manifest("AT30126", 3, "LSHI", 6), manifest("AT102626", 10, "LSHI", 7),
    manifest("ATK01", 842, "KLZ", 8), manifest("AT08026", 4, "KLZ", 9), manifest("AT11726", 2, "KLZ", 10), manifest("AT12726", 5, "KLZ", 11)
  ];
  const shipments = shipmentRows([
    ["01/09/2026", "DHL", "FIH", 1, 1227, "GROUPAGE 1\nATF01 : 1227kgs"],
    ["02/09/2026", "DHL", "LSHI", 1, 5504, "GROUPAGE 2\nATL01 : 5500kgs\nAT24326 : 3kgs\nAT30126 : 1kgs"],
    ["03/09/2026", "DHL", "LSHI", 1, 842, "GROUPAGE 3\nATK01KLZ : 842kgs"],
    ["04/09/2026", "DHL", "LSHI", 1, 2, "GROUPAGE 4\nAT11726KLZ : 2kgs"],
    ["05/09/2026", "DHL", "LSHI", 1, 5, "GROUPAGE 5\nAT11726KLZ : 5kgs"],
    ["06/09/2026", "DHL", "LSHI", 1, 10, "GROUPAGE 6\nAT108226 : 10kgs"],
    ["07/09/2026", "DHL", "LSHI", 1, 4, "GROUPAGE 7\nAT08036KLZ : 4kgs"]
  ]);
  const result = aggregateShipmentByAgency(manifests, shipments, "2026-08");
  assert.deepEqual(pick(result.FIH), { registeredWeightKg: 1525, certifiedShippedWeightKg: 1227, remainingWeightKg: 298, status: "CERTIFIED" });
  assert.deepEqual(pick(result.LSHI), { registeredWeightKg: 5514, certifiedShippedWeightKg: 5500, remainingWeightKg: 14, status: "PARTIAL" });
  assert.deepEqual(pick(result.KLZ), { registeredWeightKg: 853, certifiedShippedWeightKg: 842, remainingWeightKg: 11, status: "PARTIAL" });
  assert.deepEqual(result.total, { registeredWeightKg: 7892, certifiedShippedWeightKg: 7569, remainingWeightKg: 323, status: "PARTIAL", anomalies: result.total.anomalies });
});

function manifest(code: string, weightKg: number, agency: BilanAgency, sourceRow = 2): BilanManifestParcel {
  return { date: "2026-08-01", rawCode: code, code, weightKg, expectedAmount: null, agency, sourceSheet: agency, sourceRow };
}
function shipmentRows(rows: unknown[][]): readonly BilanShipment[] { return adaptShipmentRows(rows).rows; }
function pick(value: { registeredWeightKg: number; certifiedShippedWeightKg: number; remainingWeightKg: number; status: string }) {
  return { registeredWeightKg: value.registeredWeightKg, certifiedShippedWeightKg: value.certifiedShippedWeightKg, remainingWeightKg: value.remainingWeightKg, status: value.status };
}
