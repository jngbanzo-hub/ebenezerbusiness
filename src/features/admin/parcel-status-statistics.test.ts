import assert from "node:assert/strict";
import test from "node:test";

import { buildManifestStatisticsFromParcelRows, buildParcelStatusSituation, normalizeParcelStatus, type RawParcelStatusRow } from "./parcel-status-statistics";

const rows: RawParcelStatusRow[] = [
  { destination: "FIH", rowNumber: 2, dateRaw: "2026-07-01", codeRaw: "A1", weightRaw: "2 Kgs", statusRaw: "⚪ En Attente" },
  { destination: "FIH", rowNumber: 3, dateRaw: "2026-07-02", codeRaw: "A2", weightRaw: "x", statusRaw: "✈️ En Vol" },
  { destination: "LSHI", rowNumber: 2, dateRaw: "2026-07-03", codeRaw: "B1", weightRaw: 3, statusRaw: "🏢 Arrivé" },
  { destination: "LSHI", rowNumber: 4, dateRaw: "2026-07-04", codeRaw: "B1", weightRaw: 4, statusRaw: "✅ Livré" },
  { destination: "KLZ", rowNumber: 2, dateRaw: "2026-08-01", codeRaw: "C1", weightRaw: 5, statusRaw: "🚚 En Transit" },
  { destination: "KLZ", rowNumber: 3, dateRaw: "2026-08-01", codeRaw: "", weightRaw: 1, statusRaw: "Inconnu" },
  { destination: "KLZ", rowNumber: 4, dateRaw: "2026-08-01", codeRaw: "C2", weightRaw: 1, statusRaw: "Statut spécial" }
];

test("normalise accents, casse, emojis et variantes contrôlées", () => {
  assert.equal(normalizeParcelStatus("⚪ En Attente"), "WAITING_COO");
  assert.equal(normalizeParcelStatus("✈️ En Vol"), "IN_FLIGHT");
  assert.equal(normalizeParcelStatus("🚚 En Transit"), "IN_TRANSIT");
  assert.equal(normalizeParcelStatus("🏢 Arrivé"), "ARRIVED");
  assert.equal(normalizeParcelStatus("✅ livré"), "DELIVERED");
  assert.equal(normalizeParcelStatus(" ENREGISTRÉ "), "WAITING_COO");
  assert.equal(normalizeParcelStatus("autre"), null);
});

test("déduplique un code en conservant la ligne actuelle la plus récente", () => {
  const result = buildParcelStatusSituation(rows);
  assert.equal(result.anomalies.duplicateCodes, 1);
  assert.equal(result.destinations.LSHI.DELIVERED.parcels, 1);
  assert.equal(result.destinations.LSHI.ARRIVED.parcels, 0);
  assert.equal(result.global.total.parcels, 4);
});

test("compte le colis malgré un poids invalide et expose les anomalies", () => {
  const result = buildParcelStatusSituation(rows);
  assert.equal(result.destinations.FIH.IN_FLIGHT.parcels, 1);
  assert.equal(result.destinations.FIH.IN_FLIGHT.weightKg, 0);
  assert.equal(result.anomalies.invalidWeights, 1);
  assert.equal(result.anomalies.emptyCodes, 1);
  assert.equal(result.anomalies.unknownStatuses, 1);
  assert.equal(result.anomalies.unknownStatusValues[0].destination, "KLZ");
});

test("respecte destination, statut et période d'enregistrement", () => {
  assert.equal(buildParcelStatusSituation(rows, { destination: "FIH" }).global.total.parcels, 2);
  assert.equal(buildParcelStatusSituation(rows, { status: "DELIVERED" }).global.total.parcels, 1);
  assert.equal(buildParcelStatusSituation(rows, { fromMonth: "2026-08", toMonth: "2026-08" }).global.total.parcels, 1);
  assert.equal(buildParcelStatusSituation(rows, { destination: "LSHI", status: "IN_FLIGHT" }).global.total.parcels, 0);
  assert.equal(buildParcelStatusSituation(rows, { fromMonth: "2027-01" }).rows.length, 0);
});

test("le mois est autonome et se combine avec les autres filtres", () => {
  const monthlyRows: RawParcelStatusRow[] = [
    { destination: "FIH", rowNumber: 2, dateRaw: "2026-01-10", codeRaw: "JAN", weightRaw: 1, statusRaw: "En attente" },
    { destination: "FIH", rowNumber: 3, dateRaw: "2026-04-10", codeRaw: "APR-FIH", weightRaw: 2, statusRaw: "En vol" },
    { destination: "KLZ", rowNumber: 2, dateRaw: "2026-04-11", codeRaw: "APR-KLZ", weightRaw: 3, statusRaw: "Arrivé" },
    { destination: "KLZ", rowNumber: 3, dateRaw: "2025-04-11", codeRaw: "APR-2025", weightRaw: 4, statusRaw: "Arrivé" },
    { destination: "LSHI", rowNumber: 2, dateRaw: "2026-12-10", codeRaw: "DEC", weightRaw: 5, statusRaw: "Livré" }
  ];

  assert.equal(buildParcelStatusSituation(monthlyRows).rows.length, 5);
  assert.equal(buildParcelStatusSituation(monthlyRows, { month: 1 }).rows.length, 1);
  assert.equal(buildParcelStatusSituation(monthlyRows, { month: 4 }).rows.length, 3);
  assert.equal(buildParcelStatusSituation(monthlyRows, { month: 12 }).rows.length, 1);
  assert.equal(buildParcelStatusSituation(monthlyRows, { month: 4, fromMonth: "2026-04", toMonth: "2026-04" }).rows.length, 2);
  assert.equal(buildParcelStatusSituation(monthlyRows, { month: 4, destination: "KLZ" }).rows.length, 2);
  assert.equal(buildParcelStatusSituation(monthlyRows, { month: 4, status: "ARRIVED" }).rows.length, 2);
  assert.equal(buildParcelStatusSituation(monthlyRows, { month: 4, fromMonth: "2026-04", toMonth: "2026-04", destination: "KLZ", status: "ARRIVED" }).rows.length, 1);
});

test("le total global égale la somme des trois destinations", () => {
  const result = buildParcelStatusSituation(rows);
  assert.equal(result.global.total.parcels, result.destinations.FIH.total.parcels + result.destinations.LSHI.total.parcels + result.destinations.KLZ.total.parcels);
  assert.equal(result.global.total.weightKg, result.destinations.FIH.total.weightKg + result.destinations.LSHI.total.weightKg + result.destinations.KLZ.total.weightKg);
});

test("les cartes et séries mensuelles utilisent exactement les lignes filtrées", () => {
  const situation = buildParcelStatusSituation(rows, { destination: "FIH", status: "WAITING_COO" });
  const statistics = buildManifestStatisticsFromParcelRows(situation.rows);
  assert.equal(statistics.annualParcels?.total, situation.global.total.parcels);
  assert.equal(statistics.annualKilograms?.total, situation.global.total.weightKg);
  assert.equal(statistics.annualParcels?.fih, 1);
  assert.equal(statistics.annualParcels?.lshi, 0);
});
