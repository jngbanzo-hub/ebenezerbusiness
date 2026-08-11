import assert from "node:assert/strict";
import test from "node:test";
import { buildStoragePeriodSummary } from "./storage-period";

test("reporte le stock du mois précédent sans confondre corrections et arrivages", () => {
  const summary = buildStoragePeriodSummary([
    { business_date: "2026-08-31", event_type: "OPENING_BALANCE_RECORDED", parcel_count_delta: 90, weight_kg_delta: 349 },
    { business_date: "2026-09-02", event_type: "MANUAL_ARRIVAL_RECORDED", parcel_count_delta: 10, weight_kg_delta: 50.125 },
    { business_date: "2026-09-07", event_type: "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", parcel_count_delta: -4, weight_kg_delta: -20.125 },
    { business_date: "2026-09-08", event_type: "ADMIN_CORRECTION", parcel_count_delta: 2, weight_kg_delta: 5 }
  ], "2026-09-01", "2026-09-30");

  assert.deepEqual(summary, {
    openingParcels: 90,
    openingWeightKg: 349,
    arrivalsParcels: 10,
    arrivalsWeightKg: 50.125,
    departuresParcels: 4,
    departuresWeightKg: 20.125,
    closingParcels: 98,
    closingWeightKg: 384
  });
});

test("ignore les événements postérieurs à la période", () => {
  const summary = buildStoragePeriodSummary([
    { business_date: "2026-12-31", event_type: "MANUAL_ARRIVAL_RECORDED", parcel_count_delta: 5, weight_kg_delta: 12 },
    { business_date: "2027-01-31", event_type: "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", parcel_count_delta: -1, weight_kg_delta: -2 },
    { business_date: "2027-02-01", event_type: "MANUAL_ARRIVAL_RECORDED", parcel_count_delta: 99, weight_kg_delta: 99 }
  ], "2027-01-01", "2027-01-31");

  assert.equal(summary.openingParcels, 5);
  assert.equal(summary.closingParcels, 4);
  assert.equal(summary.closingWeightKg, 10);
});
