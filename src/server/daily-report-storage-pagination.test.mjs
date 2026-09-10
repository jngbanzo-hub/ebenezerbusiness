import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./stockages-v2.ts", import.meta.url), "utf8");
const reportReader = source.slice(
  source.indexOf("export async function readStorageReportEvents"),
  source.indexOf("export type ArrivalParcel")
);

test("le Rapport Synthèse pagine tout le registre Stockage au-delà de 1 000 événements", () => {
  assert.match(reportReader, /const pageSize = 1000/);
  assert.match(reportReader, /for \(let offset = 0; ; offset \+= pageSize\)/);
  assert.match(reportReader, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(reportReader, /events\.push\(\.\.\.page\)/);
  assert.match(reportReader, /if \(page\.length < pageSize\) break/);
});

test("la pagination garde une clé d'ordre stable et les filtres métier existants", () => {
  assert.match(reportReader, /\.gte\("business_date", from\)/);
  assert.match(reportReader, /\.lte\("business_date", to\)/);
  assert.match(reportReader, /\.order\("occurred_at", \{ ascending: true \}\)/);
  assert.match(reportReader, /\.order\("event_id", \{ ascending: true \}\)/);
  assert.match(reportReader, /if \(agency\) query = query\.eq\("agency", agency\)/);
});

test("la lecture Rapport Synthèse reste strictement read-only", () => {
  assert.doesNotMatch(reportReader, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
});
