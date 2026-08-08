import assert from "node:assert/strict";
import test from "node:test";

import { manifestStatusLabel, normalizeManifestStatus, normalizeManifestStatusFilter } from "./manifest-status.ts";

test("normalise les statuts décorés, les accents, la casse et les espaces", () => {
  for (const value of ["📦 Arrivé", "Arrivé", "ARRIVÉ", "arrive", "  📦   aRrIvÉ  "]) assert.equal(normalizeManifestStatus(value), "ARRIVE");
  for (const value of ["✅ Livré", "Livré", "LIVRÉ", "livre"]) assert.equal(normalizeManifestStatus(value), "LIVRE");
  for (const value of ["✈️ En Vol", "En Vol", "EN VOL"]) assert.equal(normalizeManifestStatus(value), "EN_VOL");
  for (const value of ["🚚 En Transit", "En Transit", "EN TRANSIT"]) assert.equal(normalizeManifestStatus(value), "EN_TRANSIT");
  for (const value of ["⚪ En Attente", "En Attente", "EN ATTENTE"]) assert.equal(normalizeManifestStatus(value), "EN_ATTENTE");
});

test("préserve Tous sans confondre les statuts vides ou inconnus", () => {
  assert.equal(normalizeManifestStatusFilter(""), "");
  assert.equal(normalizeManifestStatus(""), "INCONNU");
  assert.equal(normalizeManifestStatus("statut mystère"), "INCONNU");
  assert.equal(manifestStatusLabel("INCONNU"), "Inconnu");
});

test("applique les mêmes valeurs canoniques aux feuilles FIH LSHI et KLZ", () => {
  for (const agency of ["FIH", "LSHI", "KLZ"]) {
    assert.equal(`${agency}:${normalizeManifestStatus("📦 Arrivé")}`, `${agency}:ARRIVE`);
    assert.equal(`${agency}:${normalizeManifestStatus("✅ Livré")}`, `${agency}:LIVRE`);
  }
});
