import assert from "node:assert/strict";
import test from "node:test";

import { parseOptionalInteger, resolveShipmentDateRange } from "./admin-statistics-filter-validation";

test("normalise les mois transmis par le navigateur", () => {
  assert.equal(parseOptionalInteger(null, 1, 12), null);
  assert.equal(parseOptionalInteger("", 1, 12), null);
  assert.equal(parseOptionalInteger("1", 1, 12), 1);
  assert.equal(parseOptionalInteger("04", 1, 12), 4);
  assert.equal(parseOptionalInteger("4", 1, 12), 4);
  assert.equal(parseOptionalInteger("12", 1, 12), 12);
});

test("refuse les mois hors plage et les formats ambigus", () => {
  assert.equal(parseOptionalInteger("0", 1, 12), false);
  assert.equal(parseOptionalInteger("13", 1, 12), false);
  assert.equal(parseOptionalInteger("avril", 1, 12), false);
  assert.equal(parseOptionalInteger("2026-04", 1, 12), false);
});

test("année et mois priment sur les dates personnalisées résiduelles", () => {
  assert.deepEqual(resolveShipmentDateRange({ year: "2026", month: 4, from: "2026-06-01", to: "2026-06-30" }), { from: "2026-04-01", to: "2026-04-30" });
  assert.deepEqual(resolveShipmentDateRange({ year: "2026", month: 1, from: "", to: "" }), { from: "2026-01-01", to: "2026-01-31" });
  assert.deepEqual(resolveShipmentDateRange({ year: "2026", month: 6, from: "", to: "" }), { from: "2026-06-01", to: "2026-06-30" });
  assert.deepEqual(resolveShipmentDateRange({ year: "2026", month: 12, from: "", to: "" }), { from: "2026-12-01", to: "2026-12-31" });
  assert.deepEqual(resolveShipmentDateRange({ year: "2026", month: null, from: "", to: "" }), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(resolveShipmentDateRange({ year: "", month: null, from: "2026-03-01", to: "2026-03-31" }), { from: "2026-03-01", to: "2026-03-31" });
  assert.equal(resolveShipmentDateRange({ year: "", month: 4, from: "", to: "" }), false);
});
