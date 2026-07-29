import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const agentRoute = await readFile(
  new URL("../src/app/api/agent/stockages/status/route.ts", import.meta.url),
  "utf8"
);
const adminRoute = await readFile(
  new URL("../src/app/api/admin/stockages/status/route.ts", import.meta.url),
  "utf8"
);
const sheetsSource = await readFile(
  new URL("../src/server/stockages-sheets.ts", import.meta.url),
  "utf8"
);
const flagsSource = await readFile(
  new URL("../src/server/stockages-feature-flags.ts", import.meta.url),
  "utf8"
);
const dashboard = await readFile(
  new URL("../src/features/agent/agent-dashboard.tsx", import.meta.url),
  "utf8"
);
const statusPage = await readFile(
  new URL("../src/features/stockages/stockages-status-page.tsx", import.meta.url),
  "utf8"
);

test("les routes Stockages exposent uniquement GET et désactivent le cache", () => {
  for (const route of [agentRoute, adminRoute]) {
    assert.ok(route.includes("export async function GET"));
    assert.equal(
      /export async function (POST|PUT|PATCH|DELETE)/.test(route),
      false
    );
    assert.ok(route.includes('"Cache-Control": "private, no-store, max-age=0"'));
  }
});

test("le filtrage Agent utilise exclusivement le site de l’identité serveur", () => {
  assert.ok(agentRoute.includes("await authorizeAgentRequest(request)"));
  assert.ok(agentRoute.includes("authorization.identity.site"));
  assert.equal(agentRoute.includes("request.json"), false);
  assert.equal(agentRoute.includes("searchParams"), false);
});

test("la consultation Admin exige un ADMIN actif et retourne les quatre sites", () => {
  assert.ok(adminRoute.includes("await authorizeAdminRequest(request)"));
  assert.ok(adminRoute.includes("readStockagesPreparationStatus(STOCKAGES_SITES)"));
});

test("la source Stockages utilise uniquement Google Sheets en lecture seule", () => {
  assert.ok(
    sheetsSource.includes(
      "https://www.googleapis.com/auth/spreadsheets.readonly"
    )
  );
  for (const range of [
    "PARAMETRES!A:E",
    "SOLDE INITIAL!A:I",
    "AUDIT!A:J"
  ]) {
    assert.ok(sheetsSource.includes(range));
  }
  assert.equal(sheetsSource.includes("MANIFESTE PUBLIC"), false);
  assert.equal(sheetsSource.includes("script.google.com"), false);
  assert.equal(sheetsSource.includes("batchUpdate"), false);
  assert.equal(sheetsSource.includes("values:append"), false);
  assert.equal(sheetsSource.includes('method: "PUT"'), false);
  assert.equal(sheetsSource.includes('method: "PATCH"'), false);
  assert.equal(sheetsSource.includes('method: "DELETE"'), false);
});

test("le feature flag reste serveur et refuse toute activation réelle", () => {
  assert.ok(flagsSource.includes('import "server-only"'));
  assert.ok(flagsSource.includes("STOCKAGES_REAL_SYNC_ENABLED"));
  assert.ok(flagsSource.includes('=== "true"'));
  assert.equal(statusPage.includes("STOCKAGES_REAL_SYNC_ENABLED"), false);
});

test("l’interface reste en préparation sans action métier", () => {
  assert.ok(statusPage.includes("EN PRÉPARATION"));
  assert.ok(statusPage.includes("Activation officielle prévue le 03/08/2026 à 07:00."));
  assert.ok(statusPage.includes("strictement en lecture seule"));
  assert.equal(statusPage.includes("synchroniserStatutsStockages"), false);
  assert.equal(statusPage.includes("activerSystemeStockages"), false);
  assert.equal(statusPage.includes("recalculerStockJournalier"), false);
  assert.equal(statusPage.includes("creerPhotographieInitialeStockages"), false);
});

test("le tableau de bord Agent contient exactement les trois modules autorisés", () => {
  for (const title of ["Encaissement", "Dépenses", "Stockages"]) {
    assert.ok(dashboard.includes(`title: "${title}"`));
  }
  assert.equal(dashboard.includes('title: "Arrivage"'), false);
});
