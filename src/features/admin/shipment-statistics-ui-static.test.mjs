import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./admin-statistics-page.tsx", import.meta.url), "utf8");

test("conserve le poids expédition et ajoute les cartes générales", () => {
  assert.match(page, /label="Poids filtré"/);
  assert.match(page, /label="Poids Manifeste filtré"/);
  assert.match(page, /label="Nombre de colis filtrés"/);
  assert.match(page, /totals\.manifestWeightKg/);
});

test("affiche seulement les ventilations correspondant aux filtres", () => {
  assert.match(page, /company==="ETHIOPIAN"&&destination==="LSHI"/);
  assert.match(page, /label="Nombre de colis LSHI"/);
  assert.match(page, /label="Nombre de colis KLZ"/);
  assert.match(page, /destination==="FIH"&&\["ASKY","DHL"\]\.includes\(company\)/);
  assert.match(page, /label="Nombre de colis FIH"/);
});
