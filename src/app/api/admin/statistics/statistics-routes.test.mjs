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

test("les validations serveur couvrent tous les filtres et la pagination", () => {
  const manifest = readFileSync(new URL("./manifest/route.ts", import.meta.url), "utf8");
  const shipments = readFileSync(new URL("./shipments/route.ts", import.meta.url), "utf8");
  for (const field of ["fromMonth", "toMonth", "destination", "status", "measure"]) assert.match(manifest, new RegExp(field));
  assert.doesNotMatch(manifest, /month\s*&&\s*!year/);
  assert.match(manifest, /month:\s*month\s*\|\|\s*undefined/);
  for (const field of ["from", "to", "year", "month", "company", "destination", "status", "arrival", "search", "page", "pageSize"]) assert.match(shipments, new RegExp(field));
  assert.match(shipments, /resolveShipmentDateRange/);
  assert.match(manifest, /readParcelStatusRows/); assert.match(shipments, /Page invalide/);
});

test("Tous garde la route et la réponse historiques sans dépendre du registre", () => {
  const shipments = readFileSync(new URL("./shipments/route.ts", import.meta.url), "utf8");
  const selected = shipments.indexOf("if (cohortId) {");
  const all = shipments.indexOf("const totalPages = Math.max(1, Math.ceil(filtered.shipments.length / pageSize))", selected);
  assert.ok(selected > 0 && all > selected);
  assert.match(shipments.slice(selected, all), /readBilanOriginMonths\(\)/);
  assert.doesNotMatch(shipments.slice(all), /readBilanOriginMonths|selectShipmentCohort|cohortStatistics/);
  assert.match(shipments.slice(all), /NextResponse\.json\(\{ statistics, filters: \{ from, to, year, month, company, destination, status, arrival, search \} \}/);
});
