import assert from "node:assert/strict";
import test from "node:test";

import { filterShipmentStatistics, parseShipmentStatistics } from "./shipment-statistics";

test("ignore les lignes de formules vides et agrège les expéditions", () => {
  const parsed = parseShipmentStatistics([
    ["Date", "Compagnie"],
    ["31/07/2026", "ETHIOPIAN", "LSHI", 2, "120 Kgs", "G1", 5, 600, "", "12 COLIS", "Arrivé", "01/08/2026"],
    ["", "", "", "", "", "", 0]
  ]);
  assert.equal(parsed.shipments.length, 1); assert.equal(parsed.totals.weightKg, 120); assert.equal(parsed.totals.parcels, 12);
  assert.equal(filterShipmentStatistics(parsed.shipments, { company: "DHL" }).shipments.length, 0);
});

test("filtre arrivée, recherche et période avec des totaux cohérents", () => {
  const parsed = parseShipmentStatistics([["Date"], ["31/07/2026", "ASKY", "FIH", 1, 10, "GRP-01", 5, 50, "10", "2 COLIS", "Arrivé", "01/08/2026", "GRP-01"], ["01/08/2026", "DHL", "LSHI", 1, 20, "GRP-02", 5, 100, "20", "3 COLIS", "En Attente", "", ""]]);
  const arrived = filterShipmentStatistics(parsed.shipments, { arrival: "ARRIVED", search: "grp 01", from: "2026-07-01", to: "2026-07-31" });
  assert.equal(arrived.shipments.length, 1); assert.equal(arrived.totals.weightKg, 10); assert.equal(arrived.totals.parcels, 2);
  assert.equal(filterShipmentStatistics(parsed.shipments, { arrival: "NOT_ARRIVED" }).shipments.length, 1);
});

test("combine mois, destination, compagnie, statut et arrivée", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["15/04/2026", "ASKY", "KLZ", 1, 8.5, "APR-KLZ", 5, 42.5, "8.5", "1 COLIS", "Arrivé", "16/04/2026", "APR-KLZ"],
    ["18/04/2026", "DHL", "FIH", 1, 3.25, "APR-FIH", 5, 16.25, "3.25", "1 COLIS", "En Attente", "", ""],
    ["15/06/2026", "ASKY", "KLZ", 1, 10, "JUN-KLZ", 5, 50, "10", "1 COLIS", "Arrivé", "16/06/2026", "JUN-KLZ"]
  ]);

  const april = filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(april.shipments.length, 2);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", destination: "KLZ" }).shipments.length, 1);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", company: "ASKY" }).shipments.length, 1);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", status: "ARRIVE" }).shipments.length, 1);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", arrival: "ARRIVED" }).shipments.length, 1);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", destination: "KLZ", company: "ASKY", status: "ARRIVE", arrival: "ARRIVED" }).shipments.length, 1);
});

test("calcule le poids manifeste et sépare les colis Ethiopian LSHI/KLZ sans doublon", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["01/08/2026", "ETHIOPIAN", "LSHI", 2, 70, "AT02926klz\nAT02726 KLZ\nJL10026\nJL10026", 5, 350, "GROUPAGE 30 : 32 kg\nGROUPAGE 31 : 33 kg", "3 COLIS"],
    ["02/08/2026", "ETHIOPIAN", "LSHI", 1, 40, "JL10126", 5, 200, "36 kg", "1 COLIS"]
  ]);
  const filtered = filterShipmentStatistics(parsed.shipments, { company: "ETHIOPIAN", destination: "LSHI" });
  assert.equal(filtered.totals.weightKg, 110);
  assert.equal(filtered.totals.manifestWeightKg, 101);
  assert.equal(filtered.totals.parcels, 4);
  assert.equal(filtered.totals.destinationParcels.lshi, 2);
  assert.equal(filtered.totals.destinationParcels.klz, 2);
  assert.equal(filtered.totals.parcels, filtered.totals.destinationParcels.lshi + filtered.totals.destinationParcels.klz);
});

test("classe tous les colis ASKY et DHL vers FIH", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["03/08/2026", "ASKY", "FIH", 1, 20, "FIH10026\nFIH10126klz", 5, 100, "19 kg", "2 COLIS"],
    ["04/08/2026", "DHL", "FIH", 1, 30, "FIH10226", 5, 150, "29 kg", "1 COLIS"]
  ]);
  const asky = filterShipmentStatistics(parsed.shipments, { company: "ASKY", destination: "FIH" });
  assert.equal(asky.totals.weightKg, 20);
  assert.equal(asky.totals.manifestWeightKg, 19);
  assert.equal(asky.totals.parcels, 2);
  assert.equal(asky.totals.destinationParcels.fih, 2);
  const dhl = filterShipmentStatistics(parsed.shipments, { company: "DHL", destination: "FIH" });
  assert.equal(dhl.totals.weightKg, 30);
  assert.equal(dhl.totals.manifestWeightKg, 29);
  assert.equal(dhl.totals.parcels, 1);
  assert.equal(dhl.totals.destinationParcels.fih, 1);
  assert.equal(parsed.totals.parcels, 3);
});

test("reproduit les poids LSHI et KLZ certifiés pour août 2026", () => {
  const lshi = [
    ...Array.from({ length: 952 }, (_, index) => `AT${String(index + 1).padStart(5, "0")}26 : 5kgs`),
    "AT9999926 : 48kgs"
  ];
  const klz = [
    ...Array.from({ length: 149 }, (_, index) => `KZ${String(index + 1).padStart(5, "0")}26klz : 5kgs`),
    "KZ9999926klz : 31kgs",
    "KZ9999926klz : 31kgs"
  ];
  const filtered = filterShipmentStatistics(parseShipmentStatistics([
    ["Date"],
    ["15/08/2026", "ETHIOPIAN", "LSHI", 158, 5457, [...lshi, ...klz].join("\n"), 0, 0, "5615 kg", "1103 COLIS"]
  ]).shipments, { from: "2026-08-01", to: "2026-08-31", company: "ETHIOPIAN", destination: "LSHI" });

  assert.equal(filtered.totals.weightKg, 5457);
  assert.equal(filtered.totals.manifestWeightKg, 5615);
  assert.deepEqual(filtered.totals.destinationParcels, { fih: 0, lshi: 953, klz: 150 });
  assert.deepEqual(filtered.totals.destinationManifestWeightKg, { lshi: 4808, klz: 807 });
  assert.equal(filtered.totals.destinationManifestWeightKg.lshi + filtered.totals.destinationManifestWeightKg.klz, filtered.totals.manifestWeightKg);
});

test("additionne les occurrences de poids sans casser la déduplication des colis", () => {
  const totals = parseShipmentStatistics([
    ["Date"],
    ["15/08/2026", "ETHIOPIAN", "LSHI", 1, 8, "AT10026klz : 3kgs\nAT10026klz : 5kgs", 0, 0, "8 kg", "1 COLIS"]
  ]).totals;
  assert.equal(totals.destinationParcels.klz, 1);
  assert.equal(totals.destinationManifestWeightKg.klz, 8);
});

test("ignore les détails sans poids valide et retourne zéro sans résultat", () => {
  const malformed = parseShipmentStatistics([
    ["Date"],
    ["15/08/2026", "ETHIOPIAN", "LSHI", 1, 0, "AT10026 : poids inconnu\nAT10126klz : -3kgs", 0, 0, "", "2 COLIS"]
  ]);
  assert.deepEqual(malformed.totals.destinationManifestWeightKg, { lshi: 0, klz: 0 });
  assert.deepEqual(filterShipmentStatistics(malformed.shipments, { search: "ABSENT" }).totals.destinationManifestWeightKg, { lshi: 0, klz: 0 });
});

test("recalcule les poids après les filtres date, compagnie, statut et recherche", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["01/08/2026", "ETHIOPIAN", "LSHI", 1, 5, "GROUPAGE A\nAT10026 : 3kgs\nAT10126klz : 2kgs", 0, 0, "5 kg", "2 COLIS", "Arrivé", "", "GROUPAGE A"],
    ["02/08/2026", "ETHIOPIAN", "LSHI", 1, 7, "GROUPAGE B\nAT10226 : 7kgs", 0, 0, "7 kg", "1 COLIS", "En Attente", "", ""]
  ]);
  const filtered = filterShipmentStatistics(parsed.shipments, { from: "2026-08-01", to: "2026-08-01", company: "ETHIOPIAN", destination: "LSHI", status: "ARRIVE", arrival: "ARRIVED", search: "GROUPAGE A" });
  assert.deepEqual(filtered.totals.destinationManifestWeightKg, { lshi: 3, klz: 2 });
});

test("ventile DHL vers LSHI sans confondre AT102526 et AT102426", () => {
  const lshi = [
    ...Array.from({ length: 131 }, (_, index) => `DL${String(index + 1).padStart(5, "0")}26 : 5kgs`),
    "DL9999926 : 59kgs",
    "AT102526 : 6kgs",
    "AT102426 : 10kgs"
  ];
  const klz = [
    ...Array.from({ length: 13 }, (_, index) => `DK${String(index + 1).padStart(5, "0")}26klz : 4kgs`),
    "DK9999926klz : 10kgs"
  ];
  const filtered = filterShipmentStatistics(parseShipmentStatistics([
    ["Date"],
    ["31/08/2026", "DHL", "LSHI", 23, 775, [...lshi, ...klz].join("\n"), 0, 0, "792 kg", "148 COLIS"]
  ]).shipments, { from: "2026-08-01", to: "2026-08-31", company: "DHL", destination: "LSHI" });

  assert.equal(filtered.totals.parcels, 148);
  assert.deepEqual(filtered.totals.destinationParcels, { fih: 0, lshi: 134, klz: 14 });
  assert.deepEqual(filtered.totals.destinationManifestWeightKg, { lshi: 730, klz: 62 });
  assert.equal(filtered.totals.destinationManifestWeightKg.lshi + filtered.totals.destinationManifestWeightKg.klz, filtered.totals.manifestWeightKg);
});
