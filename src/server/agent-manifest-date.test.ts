import assert from "node:assert/strict";
import test from "node:test";

import {
  isManifestDateWithinRange,
  matchesManifestFilters,
  normalizeManifestDateFilter,
  normalizeManifestRowDate
// @ts-expect-error Node 22 exécute directement ce test TypeScript et exige l’extension explicite.
} from "./agent-manifest-date.ts";

test("normalise les dates navigateur, ISO horodatées et françaises sans décalage de fuseau", () => {
  assert.equal(normalizeManifestDateFilter("2026-08-07"), "2026-08-07");
  assert.equal(normalizeManifestRowDate("2026-07-18T23:30:00.000Z"), "2026-07-18");
  assert.equal(normalizeManifestRowDate("18/07/2026 08:15"), "2026-07-18");
  assert.equal(normalizeManifestDateFilter("2026-02-30"), "");
  assert.equal(normalizeManifestRowDate("31/02/2026"), "");
});

test("applique des bornes Du et Au inclusives", () => {
  assert.equal(isManifestDateWithinRange("2026-08-07", "2026-08-07", "2026-08-07"), true);
  assert.equal(isManifestDateWithinRange("2026-07-18", "2026-08-07", "2026-08-07"), false);
  assert.equal(isManifestDateWithinRange("2026-08-08", "2026-08-01", "2026-08-07"), false);
  assert.equal(isManifestDateWithinRange("2026-08-03", "2026-08-01", "2026-08-07"), true);
  assert.equal(isManifestDateWithinRange("", "2026-08-01", "2026-08-07"), false);
  assert.equal(isManifestDateWithinRange("2026-07-18", "", ""), true);
});

test("combine code, statut et période sans laisser passer une ligne hors période", () => {
  const row = { trackingCode: "JL14426", status: "ARRIVÉ", date: "2026-07-18" };
  assert.equal(matchesManifestFilters(row, { code: "JL14426", status: "", from: "", to: "" }), true);
  assert.equal(matchesManifestFilters(row, { code: "", status: "ARRIVÉ", from: "", to: "" }), true);
  assert.equal(matchesManifestFilters(row, { code: "", status: "", from: "2026-07-18", to: "2026-07-18" }), true);
  assert.equal(matchesManifestFilters(row, { code: "", status: "", from: "2026-07-01", to: "2026-07-31" }), true);
  assert.equal(matchesManifestFilters(row, { code: "JL14426", status: "ARRIVÉ", from: "2026-08-07", to: "2026-08-07" }), false);
  assert.equal(matchesManifestFilters(row, { code: "JL14426", status: "EN VOL", from: "2026-07-01", to: "2026-07-31" }), false);
});
