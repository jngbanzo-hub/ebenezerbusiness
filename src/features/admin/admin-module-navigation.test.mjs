import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../app/admin/", import.meta.url);
const workspace = readFileSync(new URL("./admin-workspace.tsx", import.meta.url), "utf8");
const routes = [
  ["encaissements", "payments"],
  ["caisse", "cash"],
  ["depenses", "expenses"],
  ["statistiques-expediteurs", "shippers"]
];

test("le tableau de bord expose les huit modules sur des routes dédiées", () => {
  for (const path of ["encaissements", "caisse", "depenses", "stockages", "transferts", "statistiques-expediteurs", "statistiques-manifeste", "statistiques-expeditions"]) {
    assert.match(workspace, new RegExp(`href: "/admin/${path}"`));
    assert.equal(existsSync(new URL(`./${path}/page.tsx`, root)), true);
  }
});

test("les nouvelles pages maintiennent l'autorisation Admin partagée", () => {
  assert.match(workspace, /getAdminProfile/);
  assert.match(workspace, /getSession/);
  assert.match(workspace, /onAuthStateChange/);
  assert.match(workspace, /Se déconnecter/);
  for (const [path, module] of routes) {
    const page = readFileSync(new URL(`./${path}/page.tsx`, root), "utf8");
    assert.match(page, new RegExp(`AdminWorkspace module="${module}"`));
  }
  for (const feature of ["../stockages/admin-stockages-page.tsx", "../transferts/admin-transferts-page.tsx"]) {
    const source = readFileSync(new URL(feature, import.meta.url), "utf8");
    assert.match(source, /getAdminProfile/);
    assert.match(source, /Se déconnecter/);
    assert.match(source, /Retour au tableau de bord Admin/);
  }
});

test("Encaissements, Caisse et statistiques expéditeur sont rendus indépendamment", () => {
  assert.match(workspace, /module === "payments"/);
  assert.match(workspace, /module === "cash"/);
  assert.match(workspace, /module === "shippers"/);
  assert.doesNotMatch(readFileSync(new URL("../../app/admin/encaissements/page.tsx", import.meta.url), "utf8"), /CashOpeningBalanceSection|ShipperStatisticsSection/);
  assert.doesNotMatch(readFileSync(new URL("../../app/admin/caisse/page.tsx", import.meta.url), "utf8"), /ShipperStatisticsSection|loadAdminPayments/);
});

test("Transferts reste isolé des autres moteurs", () => {
  const transfers = readFileSync(new URL("../transferts/admin-transferts-page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(transfers, /cash_events|CashAdmin|cash-admin|expense|stockEvent|logistics_events/i);
});

test("aucun Request ID n'est visible et la génération automatique reste active", () => {
  const opening = readFileSync(new URL("./cash-opening-balance.tsx", import.meta.url), "utf8");
  const controls = readFileSync(new URL("./cash-admin-controls.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(`${opening}\n${controls}`, /Request ID|placeholder=["']Request ID/);
  assert.match(opening, /createCashRequestId/);
  assert.match(controls, /createCashRequestId/);
});

test("les cartes et grilles utilisent des variantes responsive", () => {
  assert.match(workspace, /sm:grid-cols-2/);
  assert.match(workspace, /xl:grid-cols-3/);
  assert.match(workspace, /sm:flex-row/);
});
