import assert from "node:assert/strict";
import test from "node:test";

import { parseOptionalInteger } from "./admin-statistics-filter-validation";

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
