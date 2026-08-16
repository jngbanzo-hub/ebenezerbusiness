import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./admin-workspace.tsx", import.meta.url), "utf8");
const moduleSection = source.slice(source.indexOf("const ADMIN_MODULES"), source.indexOf("] as const;", source.indexOf("const ADMIN_MODULES")));
const expected = [
  "Rapport synthèse du jour",
  "Recherche globale colis",
  "Encaissements",
  "Dépenses",
  "Caisse",
  "Stockages",
  "Transferts",
  "Statistiques par expéditeur",
  "Statistiques du manifeste",
  "Statistiques des expéditions",
  "SUIVI DES EXPÉDITIONS",
  "Gestion des associations QR"
];

test("les cartes Admin suivent exactement l’ordre UX demandé", () => {
  const titles = [...moduleSection.matchAll(/title: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(titles, expected);
});

test("les routes restent inchangées et État du système suit les cartes", () => {
  for (const route of ["rapport-journalier", "recherche-globale-colis", "encaissements", "depenses", "caisse", "stockages", "transferts", "statistiques-expediteurs", "statistiques-manifeste", "statistiques-expeditions", "suivi-expeditions", "qr-associations"]) {
    assert.match(moduleSection, new RegExp(`/admin/${route}`));
  }
  assert.match(source, /<AdminModuleGrid \/><AdminSystemStatus/);
});
