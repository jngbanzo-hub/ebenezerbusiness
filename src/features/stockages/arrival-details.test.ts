import assert from "node:assert/strict";
import test from "node:test";

import { parseArrivalDetails, summarizeArrivalDetails } from "./arrival-details";

test("normalise KG/KGS, espaces, casse et décimales", () => {
  assert.deepEqual(parseArrivalDetails("JL73926:8KGs\nJL96426:5KG\nMR12526:3,5 kg\nAB12326 : 7 KGS"), [
    { trackingCode: "JL73926", weightKg: 8 },
    { trackingCode: "JL96426", weightKg: 5 },
    { trackingCode: "MR12526", weightKg: 3.5 },
    { trackingCode: "AB12326", weightKg: 7 }
  ]);
});

test("calcule automatiquement nombre et poids", () => {
  const summary = summarizeArrivalDetails("JL73926:8KGs\nJL96426:5KG");
  assert.equal(summary.count, 2);
  assert.equal(summary.totalWeightKg, 13);
  assert.equal(summary.error, "");
});

test("refuse toute saisie si une ligne ou un doublon est invalide", () => {
  assert.throws(() => parseArrivalDetails("JL73926:8KG\nligne invalide"), /Ligne invalide/);
  assert.throws(() => parseArrivalDetails("JL73926:8KG\njl73926:8kg"), /plusieurs fois/);
});
