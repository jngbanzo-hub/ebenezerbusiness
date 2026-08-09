import assert from "node:assert/strict";
import test from "node:test";

import { parcelStatusLabel } from "./parcel-status-label";

test("traduit les statuts techniques sans modifier leur valeur source", () => {
  const statuses = ["AVAILABLE", "PRESENT", "PAID", "DELIVERED", "RELEASED"] as const;

  assert.deepEqual(statuses.map(parcelStatusLabel), [
    "DISPONIBLE",
    "PRÉSENT",
    "PAYÉ",
    "LIVRÉ",
    "REMIS"
  ]);
  assert.equal(statuses[0], "AVAILABLE");
});

test("présente proprement un statut inconnu sans casser l'affichage", () => {
  assert.equal(parcelStatusLabel("custom_status"), "CUSTOM STATUS");
  assert.equal(parcelStatusLabel(""), "STATUT INCONNU");
});
