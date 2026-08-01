import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const route of ["manifest", "shipments"]) {
  test(`${route}: route Admin en lecture seule`, () => {
    const source = readFileSync(new URL(`./${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /authorizeAdminRequest\(request\)/);
    assert.match(source, /export async function GET/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
    assert.match(source, /private, no-store/);
  });
}
