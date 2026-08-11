import assert from "node:assert/strict";
import test from "node:test";

import { parseShipmentStatistics } from "@/features/admin/shipment-statistics";
import { isKlzSuffix, projectReceptionStatistics } from "./reception-statistics";

test("sépare Ethiopian LSHI et KLZ par suffixe sans perdre le total", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["01/08/2026", "ETHIOPIAN", "LSHI", 1, 10, "JL00126\nJL00226klz\nJL00326\nJL00426 KLZ", 0, 0, "1 kg\n2 kg\n3 kg\n4 kg", "4 COLIS", "En Attente"],
  ]).shipments;
  const lshi = projectReceptionStatistics(source, "LSHI");
  const klz = projectReceptionStatistics(source, "KLZ");
  assert.equal(lshi.totals.parcels, 2);
  assert.equal(klz.totals.parcels, 2);
  assert.equal(lshi.totals.parcels + klz.totals.parcels, 4);
  assert.equal(lshi.totals.weightKg, 4);
  assert.equal(klz.totals.weightKg, 6);
  assert.equal(isKlzSuffix("MR12526 klz  "), true);
});

test("conserve ASKY et DHL FIH sans appliquer le suffixe KLZ", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["02/08/2026", "ASKY", "FIH", 1, 12, "FIH00126\nFIH00226klz", 0, 0, "12 kg", "2 COLIS"],
    ["03/08/2026", "DHL", "FIH", 1, 8, "FIH00326", 0, 0, "8 kg", "1 COLIS"],
  ]).shipments;
  const fih = projectReceptionStatistics(source, "FIH");
  assert.equal(fih.totals.parcels, 3);
  assert.equal(fih.totals.weightKg, 20);
  assert.equal(projectReceptionStatistics(source, "KLZ").totals.parcels, 0);
});

test("les filtres restent compatibles avec la projection d'agence", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["02/04/2026", "ASKY", "FIH", 1, 12, "FIH00126", 0, 0, "12 kg", "1 COLIS", "Arrivé", "03/04/2026"],
    ["03/05/2026", "DHL", "FIH", 1, 8, "FIH00226", 0, 0, "8 kg", "1 COLIS", "En Attente"],
  ]).shipments;
  const april = projectReceptionStatistics(source, "FIH", { from: "2026-04-01", to: "2026-04-30", company: "ASKY", status: "ARRIVE" });
  assert.equal(april.rows.length, 1);
  assert.equal(april.totals.parcels, 1);
});
