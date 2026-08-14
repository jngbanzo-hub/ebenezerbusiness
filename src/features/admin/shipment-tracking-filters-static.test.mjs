import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./shipment-tracking-page.tsx", import.meta.url), "utf8");

test("dérive les options du dataset source et les lignes du dataset filtré", () => {
  assert.match(source, /filterShipmentTrackingRows\(allRows, filters\)/);
  assert.match(source, /companies: unique\(allRows\.map/);
  assert.match(source, /destinations: unique\(allRows\.map/);
  assert.match(source, /statuses: unique\(allRows\.map/);
  assert.doesNotMatch(source, /periodRows/);
});

test("conserve les filtres locaux sans requête source par changement", () => {
  assert.match(source, /fetch\("\/api\/admin\/shipment-tracking"/);
  assert.doesNotMatch(source, /URLSearchParams\(Object\.entries\(filters\)/);
  assert.match(source, /setFilters\(\(current\) => \(\{ \.\.\.current, \[key\]: value \}\)\)/);
});
