import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../src/app/api/admin/shipment-tracking/route.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../src/server/admin-shipment-tracking.ts", import.meta.url), "utf8");
const model = readFileSync(new URL("../src/features/admin/shipment-tracking.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/features/admin/shipment-tracking-page.tsx", import.meta.url), "utf8");

test("lecture et écriture sont Admin-only côté serveur", () => {
  assert.equal((route.match(/await authorizeAdminRequest\(request\)/g) ?? []).length, 2);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
});

test("l'écriture Google est bornée à une cellule EXPÉDITION K et relue", () => {
  assert.match(server, /const range = `\$\{SHIPMENT_TRACKING_SHEET\}!K\$\{rowNumber\}`/);
  assert.match(server, /updatedCells !== 1/);
  assert.match(server, /confirmed\.status !== status/);
  assert.doesNotMatch(server, /KLZ!|stockage|caisse|encaissement|paiement|transfert|P1/i);
});

test("la correction ne modifie jamais EXPÉDITION L", () => {
  assert.doesNotMatch(server, /!L\$\{rowNumber\}|arrivalDate/);
  assert.doesNotMatch(route, /getLocalArrivalDate|Africa\/Porto-Novo/);
});

test("les options de filtre viennent des lignes de période, pas du résultat filtré", () => {
  assert.match(route, /const periodRows = filterShipmentTrackingRows\(sourceRows, \{ from, to \}\)/);
  assert.match(route, /companies: unique\(periodRows\.map/);
  assert.match(page, /filterOptions\.companies/);
  assert.match(page, /RÉINITIALISER LES FILTRES/);
});

test("les longues identités de groupage et les statuts partagent le schéma canonique", () => {
  assert.match(route, /const statusSchema = z\.enum\(SHIPMENT_STATUSES\)/);
  assert.match(route, /identity: z\.string\(\)\.min\(3\)\.max\(100000\)/);
  assert.match(route, /admin-shipment-tracking-validation-failed/);
});

test("les plages EXPÉDITION ne sont pas doublement citées", () => {
  assert.match(server, /readRange\(`\$\{SHIPMENT_TRACKING_SHEET\}!A:N`\)/);
  assert.doesNotMatch(server, /`'\$\{SHIPMENT_TRACKING_SHEET\}'!/);
});

test("le suivi utilise une source COO dédiée", () => {
  assert.match(server, /GOOGLE_SHEETS_SHIPMENT_TRACKING_SPREADSHEET_ID/);
  assert.doesNotMatch(server, /GOOGLE_SHEETS_MANIFEST_SPREADSHEET_ID/);
});

test("l'identité stable est vérifiée avant écriture", () => {
  assert.match(model, /date, fields\.company, fields\.destination, fields\.groupage/);
  assert.match(server, /target\.identity !== identity/);
  assert.match(route, /identity: z\.string/);
});

test("les statuts officiels conservent En Vol et excluent En Transit générique", () => {
  for (const status of ["En Attente", "Non Reçu", "En Vol", "En Transit à Addis", "En Transit à Lagos", "En Transit à Libreville", "En Transit à Brazzaville", "En Transit à Lubumbashi", "Arrivé"]) assert.match(model, new RegExp(`"${status}"`));
  assert.doesNotMatch(model.match(/SHIPMENT_STATUSES = \[[\s\S]*?\] as const/)?.[0] ?? "", /^.*"En Transit".*$/m);
  assert.match(page, /row\.status\|\|"Non renseigné"/);
});

test("aucun Apps Script de brouillon ne concurrence les formules Sheets", () => {
  assert.equal(existsSync(new URL("../local-preparation/apps-script/shipment-tracking/Code.gs", import.meta.url)), false);
  assert.doesNotMatch(`${server}\n${route}`, /doPost|onEdit|En Transit à Lubumbashi/);
});

test("OAuth Google utilise le grant JWT bearer officiel", () => {
  assert.match(server, /urn:ietf:params:oauth:grant-type:jwt-bearer/);
  assert.doesNotMatch(server, /params:oauth2:grant-type/);
});

test("la modification en lot vérifie chaque identité et cible seulement la sélection", () => {
  assert.match(route, /items: z\.array/);
  assert.match(route, /for \(const item of uniqueItems\)/);
  assert.match(route, /updateShipmentStatus\(item\.rowNumber, item\.identity/);
  assert.match(page, /Tout sélectionner/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /Mise à jour…/);
  assert.match(page, /rows\.filter\(\(row\) => selected\.has\(row\.id\)\)/);
  assert.match(page, /setSelected\(new Set\(\)\); \}, \[filters\]\)/);
});
