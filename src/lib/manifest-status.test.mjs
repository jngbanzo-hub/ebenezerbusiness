import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { manifestStatusLabel, normalizeManifestStatus, normalizeManifestStatusFilter } from "./manifest-status.ts";

test("reconnaît exactement les dix statuts officiels", () => {
  const officialStatuses = [
    ["En Attente", "EN_ATTENTE"],
    ["Non Reçu", "NON_RECU"],
    ["En Vol", "EN_VOL"],
    ["En Transit à Addis", "EN_TRANSIT_ADDIS"],
    ["En Transit à Lagos", "EN_TRANSIT_LAGOS"],
    ["En Transit à Libreville", "EN_TRANSIT_LIBREVILLE"],
    ["En Transit à Brazzaville", "EN_TRANSIT_BRAZZAVILLE"],
    ["En Transit à Lubumbashi", "EN_TRANSIT_LUBUMBASHI"],
    ["Arrivé", "ARRIVE"],
    ["Arrivé à KLZ", "ARRIVE_KLZ"]
  ];

  for (const [label, canonical] of officialStatuses) {
    assert.equal(normalizeManifestStatus(label), canonical);
    assert.equal(manifestStatusLabel(canonical), label);
  }
});

test("normalise les emojis, accents, casse, espaces et espaces insécables", () => {
  assert.equal(normalizeManifestStatus("  🚚\u00a0 En   Transit à Addis  "), "EN_TRANSIT_ADDIS");
  assert.equal(normalizeManifestStatus("🚚\ufe0f\u00a0En Transit à Addis"), "EN_TRANSIT_ADDIS");
  assert.equal(normalizeManifestStatus("🚚\ufe0e\u200b\u200d  En Transit à Addis"), "EN_TRANSIT_ADDIS");
  assert.equal(normalizeManifestStatus("EN TRANSIT À ADDIS"), "EN_TRANSIT_ADDIS");
  assert.equal(normalizeManifestStatus("en transit a addis"), "EN_TRANSIT_ADDIS");
  assert.equal(normalizeManifestStatus("⚪ Non Reçu"), "NON_RECU");
  assert.equal(normalizeManifestStatus("✈️ En Vol"), "EN_VOL");
  assert.equal(normalizeManifestStatus("📦 Arrivé à KLZ"), "ARRIVE_KLZ");
});

test("reconnaît les cinq transits officiels préfixés par le camion", () => {
  for (const city of ["Addis", "Lagos", "Libreville", "Brazzaville", "Lubumbashi"]) {
    const label = `En Transit à ${city}`;
    assert.equal(manifestStatusLabel(normalizeManifestStatus(`🚚 ${label}`)), label);
    assert.equal(manifestStatusLabel(normalizeManifestStatus(`🚚\ufe0f\u00a0${label}`)), label);
  }
});

test("préserve Tous sans confondre les statuts vides ou inconnus", () => {
  assert.equal(normalizeManifestStatusFilter(""), "");
  assert.equal(normalizeManifestStatus(""), "INCONNU");
  assert.equal(normalizeManifestStatus("statut mystère"), "INCONNU");
  assert.equal(manifestStatusLabel("INCONNU"), "Inconnu");
});

test("applique les mêmes valeurs canoniques aux feuilles FIH LSHI et KLZ", () => {
  for (const agency of ["FIH", "LSHI", "KLZ"]) {
    assert.equal(`${agency}:${normalizeManifestStatus("🚚 En Transit à Addis")}`, `${agency}:EN_TRANSIT_ADDIS`);
    assert.equal(`${agency}:${normalizeManifestStatus("📦 Arrivé à KLZ")}`, `${agency}:ARRIVE_KLZ`);
  }
});

test("ne réduit pas les transits détaillés et refuse les valeurs hors référentiel", () => {
  assert.equal(manifestStatusLabel(normalizeManifestStatus("🚚 En Transit à Lagos")), "En Transit à Lagos");
  assert.equal(manifestStatusLabel(normalizeManifestStatus("En Transit à Libreville")), "En Transit à Libreville");
  assert.equal(manifestStatusLabel(normalizeManifestStatus("En Transit")), "Inconnu");
  assert.equal(manifestStatusLabel(normalizeManifestStatus("Livré")), "Inconnu");
});

test("MANIFESTE et Encaissements réutilisent le même affichage canonique", () => {
  const manifestPage = readFileSync(new URL("../features/agent/agent-manifest-page.tsx", import.meta.url), "utf8");
  const encaissements = readFileSync(new URL("../features/agent/agent-workspace.tsx", import.meta.url), "utf8");

  assert.match(manifestPage, /manifestStatusLabel\(row\.status\)/);
  assert.match(encaissements, /manifestStatusLabel\(manifestSearchResult\.row\.status\)/);
});
