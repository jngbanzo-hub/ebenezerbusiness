import assert from "node:assert/strict";
import test from "node:test";
import { enumerateReportDates, resolveReportPeriod } from "./report-period";

const today = "2026-08-08";
test("résout aujourd’hui, hier et les semaines dans Africa/Porto-Novo", () => {
  assert.deepEqual(resolveReportPeriod({ preset: "TODAY", today }), { preset: "TODAY", from: "2026-08-08", to: "2026-08-08" });
  assert.deepEqual(resolveReportPeriod({ preset: "YESTERDAY", today }), { preset: "YESTERDAY", from: "2026-08-07", to: "2026-08-07" });
  assert.deepEqual(resolveReportPeriod({ preset: "THIS_WEEK", today }), { preset: "THIS_WEEK", from: "2026-08-03", to: "2026-08-09" });
  assert.deepEqual(resolveReportPeriod({ preset: "LAST_WEEK", today }), { preset: "LAST_WEEK", from: "2026-07-27", to: "2026-08-02" });
  assert.deepEqual(resolveReportPeriod({ preset: "THIS_MONTH", today }), { preset: "THIS_MONTH", from: "2026-08-01", to: "2026-08-08" });
  assert.deepEqual(resolveReportPeriod({ preset: "LAST_MONTH", today }), { preset: "LAST_MONTH", from: "2026-07-01", to: "2026-07-31" });
});
test("accepte une période personnalisée inclusive et une date unique", () => {
  assert.deepEqual(resolveReportPeriod({ preset: "CUSTOM", today, from: "2026-08-01", to: "2026-08-08" }), { preset: "CUSTOM", from: "2026-08-01", to: "2026-08-08" });
  assert.deepEqual(enumerateReportDates("2026-08-01", "2026-08-03"), ["2026-08-01", "2026-08-02", "2026-08-03"]);
});
test("refuse une période inversée ou invalide", () => {
  assert.throws(() => resolveReportPeriod({ preset: "CUSTOM", today, from: "2026-08-09", to: "2026-08-08" }), /INVALID_REPORT_PERIOD/);
  assert.throws(() => resolveReportPeriod({ preset: "CUSTOM", today, from: "", to: "2026-08-08" }), /INVALID_REPORT_PERIOD/);
});
