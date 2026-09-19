import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../../../../../../server/stockages-v2.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../../../../../features/stockages/admin-storage-agency-detail-page.tsx", import.meta.url), "utf8");

test("la lecture détail est Admin, GET et strictement limitée à l'agence", () => {
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(route, /authorizeAdminRequest/);
  assert.match(route, /requireStorageAgency/);
  assert.match(server, /from\("stockage_parcels"\)[\s\S]*\.eq\("agency", agency\)/);
  assert.match(server, /\.in\("delivery_status", \["AVAILABLE", "PRESENT"\]\)/);
});

test("la vue est en lecture seule et distingue chaque identité technique", () => {
  assert.match(page, /key={parcel\.parcelId}/);
  assert.match(page, /parcel\.displayCode \?\? parcel\.trackingCode/);
  assert.match(page, /Aucun colis actuellement présent/);
  assert.match(page, /DISPONIBLE/);
  assert.match(page, /PRÉSENT/);
  assert.doesNotMatch(page, /method:\s*"POST"/);
});
