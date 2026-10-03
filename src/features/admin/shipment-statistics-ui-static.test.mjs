import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./admin-statistics-page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/admin/statistics/shipments/route.ts", import.meta.url), "utf8");

test("conserve le poids expédition et ajoute les cartes générales", () => {
  assert.match(page, /label="Poids filtré"/);
  assert.match(page, /label="Poids Manifeste filtré"/);
  assert.match(page, /label="Nombre de colis filtrés"/);
  assert.match(page, /totals\.manifestWeightKg/);
});

test("affiche seulement les ventilations correspondant aux filtres", () => {
  assert.match(page, /company==="ETHIOPIAN"&&\(data\.totals\.destinationParcels\.lshi>0/);
  assert.doesNotMatch(page, /company==="ETHIOPIAN"&&destination==="LSHI"/);
  assert.match(page, /label="Nombre de colis LSHI"/);
  assert.match(page, /label="Poids total LSHI"/);
  assert.match(page, /label="Nombre de colis KLZ"/);
  assert.match(page, /label="Poids total KLZ"/);
  assert.match(page, /destination==="FIH"&&\["ASKY","DHL"\]\.includes\(company\)/);
  assert.match(page, /label="Nombre de colis FIH"/);
});

test("propose les cinq filtres groupage et les transmet à la route de lecture", () => {
  assert.match(page, /options=\{\["ALL","ARRIVE","EN ATTENTE","EN VOL","EN TRANSIT"\]\}/);
  assert.match(page, /"EN VOL":"En Vol","EN TRANSIT":"En transit"/);
  assert.match(route, /\["ALL", "ARRIVE", "EN ATTENTE", "EN VOL", "EN TRANSIT"\]\.includes\(status\)/);
  assert.match(route, /filterShipmentStatistics\(source\.shipments, \{ from, to, company, destination, status, arrival, search \}\)/);
});
