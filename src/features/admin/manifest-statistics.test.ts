import assert from "node:assert/strict";
import test from "node:test";

import { filterManifestStatistics, parseManifestStatistics } from "./manifest-statistics";

test("parse les sections kilogrammes et colis sans confondre les sites", () => {
  const rows = Array.from({ length: 86 }, () => [] as unknown[]);
  rows[9] = ["Janvier 2026", 10, 20, 30, 60]; rows[21] = ["TOTAL ANNUEL", 10, 20, 30, 60];
  rows[73] = ["Janvier 2026", 1, 2, 3, 6]; rows[85] = ["TOTAL ANNUEL", 1, 2, 3, 6];
  const parsed = parseManifestStatistics(rows);
  assert.deepEqual(parsed.kilograms[0], { month: "Janvier 2026", year: 2026, fih: 10, lshi: 20, klz: 30, total: 60 });
  assert.equal(parsed.parcels[0].total, 6); assert.equal(filterManifestStatistics(parsed, { year: 2027 }).kilograms.length, 0);
});

test("les totaux sont recalculés sur la période filtrée", () => {
  const rows = Array.from({ length: 86 }, () => [] as unknown[]);
  rows[9] = ["Janvier 2026", 10, 20, 30, 60]; rows[10] = ["Février 2026", 1, 2, 3, 6];
  rows[73] = ["Janvier 2026", 1, 2, 3, 6]; rows[74] = ["Février 2026", 4, 5, 6, 15];
  const filtered = filterManifestStatistics(parseManifestStatistics(rows), { fromMonth: "2026-02", toMonth: "2026-02" });
  assert.equal(filtered.kilograms.length, 1); assert.equal(filtered.annualKilograms?.total, 6); assert.equal(filtered.annualParcels?.total, 15);
});
