import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { draftMonthPeriod, originMonthDraft, planOriginYear } from "./origin-month-planning";
import { type OriginMonth, validateCohortDefinitions } from "./cohort-catalog";
import { createBilanFilters } from "./bilan-filter-state";

const historical = ["MR", "AV", "MA", "JN", "JL", "AT", "SE", "OT", "NV", "DC"];
const rows: OriginMonth[] = [...historical, "JA", "FE"].map((prefix, index) => {
  const year = index < 10 ? 2026 : 2027, month = index < 10 ? index + 3 : index - 9;
  return { prefix, year, month, id: `${year}-${String(month).padStart(2, "0")}`, label: prefix,
    registryId: `fixture-${prefix}`, active: true, createdAt: "2026-09-18", updatedAt: "2026-09-18" };
});

test("2027 has two configured identities and ten calendar slots, without mutation or prefix invention", () => {
  const before = structuredClone(rows);
  const calendar = planOriginYear(2027, rows);
  assert.equal(calendar.length, 12);
  assert.deepEqual(calendar.map(slot => slot.configured?.prefix ?? null), ["JA", "FE", ...Array(10).fill(null)]);
  assert.deepEqual(rows, before);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows.slice(0, 10).map(row => row.prefix), historical);
  validateCohortDefinitions(rows);
});

test("all periods derive from calendar year/month, including leap years", () => {
  const calendar = planOriginYear(2027, rows);
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  calendar.forEach((slot, index) => {
    const period = `2027-${String(index + 1).padStart(2, "0")}`;
    assert.deepEqual(slot.period, { from: `${period}-01`, to: `${period}-${days[index]}` });
  });
  assert.equal(planOriginYear(2028, [])[1].period.to, "2028-02-29");
  for (const year of [1999, 2200, 2027.5, NaN]) assert.throws(() => planOriginYear(year, rows));
});

test("configuration only prefills a draft with blank prefix and automatic period", () => {
  const slot = planOriginYear(2027, rows)[2];
  assert.deepEqual(originMonthDraft(slot), { prefix: "", year: "2027", month: "3", label: "Mars 2027" });
  assert.deepEqual(draftMonthPeriod("2027", "3"), slot.period);
  for (const [year, month] of [["", ""], ["2027", "13"], ["2027", "0"], ["1999", "1"], ["2027", "1.5"]]) {
    assert.equal(draftMonthPeriod(year, month), null);
  }
});

test("explicit future registry identity becomes configured and selectable on reload, with no prefix reuse", () => {
  const future: OriginMonth = { ...rows[0], registryId: "fixture-future", id: "2027-03", prefix: "ZX", year: 2027, month: 3, label: "Mars 2027" };
  const reloaded = [...rows, future];
  validateCohortDefinitions(reloaded);
  assert.equal(planOriginYear(2027, reloaded)[2].configured, future);
  assert.equal(createBilanFilters("ZX", reloaded).cohort, "ZX");
  assert.throws(() => validateCohortDefinitions([...rows, { ...future, prefix: "MR" }]));
  assert.throws(() => validateCohortDefinitions([...rows, { ...future, month: 1, id: "2027-01" }]));
  assert.equal(planOriginYear(2027, [{ ...future, active: false }])[2].configured?.active, false);
});

test("UI adds no save path or source; Bilan only consumes the persistent registry, not calendar slots", () => {
  const ui = readFileSync("src/features/admin/bilan/admin-origin-months-page.tsx", "utf8");
  const bilan = readFileSync("src/features/admin/bilan/admin-bilan-page.tsx", "utf8");
  assert.match(ui, /setForm\(originMonthDraft\(slot\)\)/);
  assert.match(ui, /À DÉFINIR/);
  assert.match(ui, /À CONFIGURER/);
  assert.equal((ui.match(/await fetch\(/g) ?? []).length, 1);
  assert.match(bilan, /loadOriginMonths/);
  assert.doesNotMatch(bilan, /planOriginYear|origin-month-planning/);
});
