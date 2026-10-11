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

test("le filtre cohorte est dynamique et ne change pas la présentation Tous", () => {
  assert.match(page, /loadOriginMonths\(token\.current\)/);
  assert.match(page, /label="Mois d’origine \/ Cohorte"/);
  assert.match(page, /options=\{\["ALL",\.\.\.cohorts\.map/);
  assert.match(page, /<ShipmentView data=\{shipments\}/);
  assert.match(page, /<ShipmentCohortView data=\{cohortShipments\}/);
  assert.match(page, /Ventilation partielle/);
  assert.match(page, /Poids officiel \(colonne E\), montant et groupages ne sont pas ventilés/);
});

test("la ventilation agence n'existe que dans la vue Cohorte et signale les parts non certifiables", () => {
  const cohortView = page.split("function ShipmentCohortView")[1].split("function ShipmentView")[0];
  const allView = page.split("function ShipmentView")[1].split("function Breakdown")[0];
  assert.match(cohortView, /data\.totals\.byAgency\[agency\]\.parcels/);
  assert.match(cohortView, /data\.totals\.byAgency\[agency\]\.commercialWeightKg/);
  assert.match(cohortView, /Ventilation par agence incomplète/);
  assert.match(cohortView, /Poids commercial \$\{agency\.toUpperCase\(\)\}/);
  assert.doesNotMatch(allView, /unallocatedAgency|Poids commercial \$\{agency/);
});

test("Compagnie ALL rend les trois agences sans remplacer les six cartes globales ni la vue Cohorte", () => {
  const allView = page.split("function ShipmentView")[1].split("function Breakdown")[0];
  const cohortView = page.split("function ShipmentCohortView")[1].split("function ShipmentView")[0];
  assert.match(allView, /hasLshiKlzBreakdown=hasEthiopianBreakdown\|\|hasDhlBreakdown\|\|company==="ALL"/);
  assert.match(allView, /company==="ALL"\?<Metric label="Poids total FIH"/);
  assert.match(allView, /label="Nombre de colis FIH"/);
  assert.match(allView, /label="Nombre de colis LSHI"/);
  assert.match(allView, /label="Nombre de colis KLZ"/);
  for (const label of ["Expéditions filtrées", "Groupages filtrés", "Poids filtré", "Poids Manifeste filtré", "Nombre de colis filtrés", "Montant filtré"]) {
    assert.match(allView, new RegExp(`label="${label}"`));
  }
  assert.match(allView, /Ventilation par agence non exhaustive/);
  assert.doesNotMatch(cohortView, /destinationManifestWeightKg/);
});
