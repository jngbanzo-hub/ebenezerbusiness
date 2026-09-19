import assert from "node:assert/strict";
import test from "node:test";

import { resolveDirectionScope } from "./direction-summary-scope.ts";

const cohorts = Object.freeze([
  Object.freeze({ prefix: "AT", label: "Août 2026", year: 2026, month: 8 }),
  Object.freeze({ prefix: "SE", label: "Septembre 2026", year: 2026, month: 9 })
]);

test("septembre 2026 utilise exactement la cohorte SE et le mois civil complet", () => {
  assert.deepEqual(resolveDirectionScope("2026-09-11", cohorts), {
    businessDate: "2026-09-11",
    cohort: cohorts[1],
    analysisPeriod: { from: "2026-09-01", to: "2026-09-30" }
  });
});

test("un mois sans cohorte reste explicitement non résolu", () => {
  const scope = resolveDirectionScope("2026-10-01", cohorts);
  assert.equal(scope.cohort, null);
  assert.deepEqual(scope.analysisPeriod, { from: "2026-10-01", to: "2026-10-31" });
});
