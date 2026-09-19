import assert from "node:assert/strict";
import test from "node:test";

import { formatWeight } from "./format-weight";

test("supprime uniquement les décimales inutiles des kilogrammes", () => {
  assert.equal(formatWeight(942), "942 kg");
  assert.equal(formatWeight(942.0), "942 kg");
  assert.equal(formatWeight(151.0), "151 kg");
  assert.equal(formatWeight(8.5), "8,5 kg");
  assert.equal(formatWeight(3.25), "3,25 kg");
  assert.equal(formatWeight(0.75), "0,75 kg");
});
