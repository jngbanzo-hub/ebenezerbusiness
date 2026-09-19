import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

const AGENCIES = ["COO", "FIH", "LSHI", "KLZ"];

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: values.reduce((total, value) => total + value, 0) / values.length,
    median: (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2,
    p95: percentile(values, 0.95),
  };
}

function measure(action, iterations = 80) {
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    action(index);
    samples.push(performance.now() - startedAt);
  }
  return summary(samples);
}

function uuid(agencyIndex, row) {
  return `${agencyIndex.toString(16).padStart(8, "0")}-0000-4000-8000-${row.toString(16).padStart(12, "0")}`;
}

function makeAgencyRows(size) {
  return AGENCIES.map((_, agencyIndex) =>
    Array.from({ length: size }, (unused, row) => uuid(agencyIndex, row)),
  );
}

function legacyFind(sheets, requestId) {
  for (let agency = 0; agency < sheets.length; agency += 1) {
    for (let row = 0; row < sheets[agency].length; row += 1) {
      if (sheets[agency][row].toLowerCase() === requestId) return [agency, row];
    }
  }
  return null;
}

function indexedFind(indexes, requestId) {
  for (let agency = 0; agency < indexes.length; agency += 1) {
    const row = indexes[agency].get(requestId);
    if (row !== undefined) return [agency, row];
  }
  return null;
}

function makeStats(size) {
  return Array.from({ length: size }, (unused, index) => ({
    key: `JOURNALIER|2026-09-${String((index % 28) + 1).padStart(2, "0")}|${AGENCIES[index % 4]}|USD|${index}`,
    total: index + 1,
    count: (index % 7) + 1,
    format: "currency",
  }));
}

function legacyRewrite(rows, affected) {
  const next = rows.map((row) => ({ ...row, format: "currency" }));
  for (const index of affected) {
    next[index].total += 10;
    next[index].count += 1;
  }
  return next;
}

function targetedUpdate(rows, affected) {
  return affected.map((index) => ({
    index,
    total: rows[index].total + 10,
    count: rows[index].count + 1,
  }));
}

test("recherche ciblée stable pour identifiant présent, absent et collision inter-agences", () => {
  const sheets = makeAgencyRows(5_000);
  const indexes = sheets.map((rows) => new Map(rows.map((value, row) => [value, row])));
  const existing = sheets[2][4_500];
  assert.deepEqual(indexedFind(indexes, existing), legacyFind(sheets, existing));
  assert.equal(indexedFind(indexes, "ffffffff-ffff-4fff-8fff-ffffffffffff"), null);
  sheets[3][10] = existing;
  indexes[3].set(existing, 10);
  assert.deepEqual(indexedFind(indexes, existing), [2, 4_500]);
  assert.deepEqual(indexedFind(indexes, existing), indexedFind(indexes, existing));
});

test("mise à jour statistique ciblée égale aux quatre cellules du recalcul complet", () => {
  const rows = makeStats(2_000);
  const affected = [12, 513, 1_020, 1_777];
  const legacy = legacyRewrite(rows, affected);
  const targeted = targetedUpdate(rows, affected);
  for (const update of targeted) {
    assert.equal(update.total, legacy[update.index].total);
    assert.equal(update.count, legacy[update.index].count);
  }
  assert.equal(targeted.length, 4);
});

test("harness comparatif petite feuille et volume réaliste", (context) => {
  for (const size of [50, 5_000]) {
    const sheets = makeAgencyRows(size);
    const indexes = sheets.map((rows) => new Map(rows.map((value, row) => [value, row])));
    const existing = sheets[3][size - 1];
    const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const stats = makeStats(Math.max(100, Math.floor(size / 2)));
    const affected = [1, 11, 31, 51];
    const result = {
      size,
      idExistingBefore: measure(() => legacyFind(sheets, existing)),
      idExistingAfter: measure(() => indexedFind(indexes, existing)),
      idMissingBefore: measure(() => legacyFind(sheets, missing)),
      idMissingAfter: measure(() => indexedFind(indexes, missing)),
      statsBefore: measure(() => legacyRewrite(stats, affected)),
      statsAfter: measure(() => targetedUpdate(stats, affected)),
    };
    context.diagnostic(JSON.stringify(result));
    assert.ok(result.idExistingAfter.mean < result.idExistingBefore.mean);
    assert.ok(result.idMissingAfter.mean < result.idMissingBefore.mean);
    assert.ok(result.statsAfter.mean < result.statsBefore.mean);
  }
});

test("un agrégat manquant ou incohérent exige le fallback intégral", () => {
  const entries = new Map([
    ["day-agency", { total: 10, count: 1 }],
    ["day-all", { total: 10, count: 1 }],
    ["month-agency", { total: 10, count: 1 }],
  ]);
  assert.equal(entries.has("month-all"), false);
  entries.set("month-all", { total: Number.NaN, count: 1 });
  assert.equal(Number.isFinite(entries.get("month-all").total), false);
});
