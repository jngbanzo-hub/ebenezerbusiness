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
