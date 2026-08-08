import assert from "node:assert/strict";
import test from "node:test";

import { detectManifestHeaderMap } from "./manifest-header-map.ts";

for (const site of ["FIH", "LSHI", "KLZ"]) {
  test(`${site} détecte Statut par son en-tête et non par la colonne Paiement`, () => {
    const rows = [
      ["Rapport", site],
      ["Date", "Code colis", "Expéditeur", "Destination", "Poids", "Montant", "Paiement", "Statut"],
      ["2026-08-08", `${site}001`, "—", site, "2 kg", "20 USD", "PAYÉ", "📦 Arrivé"]
    ];
    const map = detectManifestHeaderMap(rows);
    assert.equal(map.headerRowIndex, 1);
    assert.equal(map.statusIndex, 7);
    assert.equal(rows[2][map.statusIndex], "📦 Arrivé");
    assert.notEqual(map.statusIndex, 6);
  });
}

test("accepte les variantes STATUS et Status avec espaces et casse", () => {
  for (const header of ["STATUT", "Statut", "STATUS", "Status", "  status  "]) {
    const map = detectManifestHeaderMap([["Date", "Code", "Poids", header]]);
    assert.equal(map.statusIndex, 3, header);
  }
});

test("refuse de confondre Paiement avec Statut", () => {
  const map = detectManifestHeaderMap([["Date", "Code colis", "Poids", "Paiement"]]);
  assert.equal(map.statusIndex, -1);
});
