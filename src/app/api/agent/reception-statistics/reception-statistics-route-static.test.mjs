import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("la destination est imposée par l'identité Agent", () => {
  assert.match(route, /const agency = authorization\.identity\.site/);
  assert.match(route, /params\.has\("destination"\)/);
  assert.doesNotMatch(route, /params\.get\("destination"\)/);
  assert.match(route, /!isReceptionAgency\(agency\).*403/);
});

test("la route reste privée et en lecture seule", () => {
  assert.match(route, /Cache-Control.*private, no-store/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(/);
});
