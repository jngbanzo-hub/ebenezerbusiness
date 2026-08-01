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
