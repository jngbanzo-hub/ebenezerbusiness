import assert from "node:assert/strict";
import test from "node:test";

import { filterManifestStatistics, parseManifestStatistics } from "./manifest-statistics";

test("parse les sections kilogrammes et colis sans confondre les sites", () => {
  const rows = Array.from({ length: 86 }, () => [] as unknown[]);
  rows[9] = ["Janvier 2026", 10, 20, 30, 60]; rows[21] = ["TOTAL ANNUEL", 10, 20, 30, 60];
  rows[73] = ["Janvier 2026", 1, 2, 3, 6]; rows[85] = ["TOTAL ANNUEL", 1, 2, 3, 6];
  const parsed = parseManifestStatistics(rows);
  assert.deepEqual(parsed.kilograms[0], { month: "Janvier 2026", year: 2026, fih: 10, lshi: 20, klz: 30, total: 60 });
  assert.equal(parsed.parcels[0].total, 6); assert.equal(filterManifestStatistics(parsed, 2027).kilograms.length, 0);
});
