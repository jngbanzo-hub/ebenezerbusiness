import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts from "typescript";

const sourceUrl = new URL(
  "../src/features/admin/shippers.ts",
  import.meta.url
);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString(
  "base64"
)}`;
const {
  buildShipperSuggestions,
  calculateShipperStatistics,
  normalizeShipperName,
  parseStrictManifestDate
} = await import(moduleUrl);

const authorizationSource = await readFile(
  new URL("../src/server/admin-authorization.ts", import.meta.url),
  "utf8"
);
const compiledAuthorization = ts
  .transpileModule(authorizationSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  })
  .outputText.replace(
    'import { createClient } from "@supabase/supabase-js";',
    "const createClient = () => { throw new Error('non utilisé dans ce test'); };"
  );
const authorizationModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiledAuthorization).toString(
    "base64"
  )}`
);

const baseFilters = {
  shipper: "Jacques NGBANZO",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  site: "ALL",
  destination: "ALL"
};

function row(overrides = {}) {
  return {
    sourceSite: "FIH",
    rowNumber: 2,
    dateRaw: "15/07/2026",
    codeColisRaw: "JL45426",
    expediteurRaw: "Jacques NGBANZO +2290100000000",
    poidsRaw: "10",
    ...overrides
  };
}

test("normalise strictement la casse et les espaces sans retirer les accents", () => {
  assert.equal(
    normalizeShipperName("  Jacques  NGBANZO "),
    normalizeShipperName("jacques ngbanzo")
  );
  assert.notEqual(
    normalizeShipperName("José NGBANZO"),
    normalizeShipperName("Jose NGBANZO")
  );
});

test("les suggestions ne révèlent pas le téléphone et ne fusionnent pas les accents", () => {
  const suggestions = buildShipperSuggestions(
    [
      row(),
      row({
        rowNumber: 3,
        expediteurRaw: "jacques  ngbanzo +2290200000000"
      }),
      row({ rowNumber: 4, expediteurRaw: "Jacqués NGBANZO +2290300000000" })
    ],
    "jacques"
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].name, "Jacques NGBANZO");
  assert.equal(suggestions[0].name.includes("229"), false);
});

test("accepte uniquement DD/MM/YYYY avec validation calendaire stricte", () => {
  assert.deepEqual(parseStrictManifestDate("29/02/2024"), {
    dateKey: "2024-02-29"
  });
  assert.equal(parseStrictManifestDate("29/02/2025"), null);
  assert.equal(parseStrictManifestDate("1/07/2026"), null);
  assert.equal(parseStrictManifestDate("2026-07-01"), null);
  assert.equal(parseStrictManifestDate("Date"), null);
  assert.equal(parseStrictManifestDate(""), null);
});

test("applique une période inclusive et les filtres site et destination", () => {
  const rows = [
    row({ dateRaw: "01/07/2026", codeColisRaw: "A" }),
    row({ rowNumber: 3, dateRaw: "31/07/2026", codeColisRaw: "B" }),
    row({
      sourceSite: "LSHI",
      rowNumber: 4,
      dateRaw: "15/07/2026",
      codeColisRaw: "C"
    }),
    row({ rowNumber: 5, dateRaw: "01/08/2026", codeColisRaw: "D" })
  ];

  assert.equal(calculateShipperStatistics(rows, baseFilters).nombreColis, 3);
  assert.equal(
    calculateShipperStatistics(rows, {
      ...baseFilters,
      site: "FIH",
      destination: "Kinshasa"
    }).nombreColis,
    2
  );
  assert.equal(
    calculateShipperStatistics(rows, {
      ...baseFilters,
      destination: "Lubumbashi"
    }).nombreColis,
    1
  );
});

test("déduplique dans une feuille sans multiplier le poids", () => {
  const statistics = calculateShipperStatistics(
    [row(), row({ rowNumber: 3, codeColisRaw: " jl45426 ", poidsRaw: "10" })],
    baseFilters
  );

  assert.equal(statistics.nombreColis, 1);
  assert.equal(statistics.totalKilogrammes, 10);
  assert.equal(statistics.anomalies.duplicateRows, 1);
});

test("compte le même code dans deux feuilles comme deux colis distincts", () => {
  const statistics = calculateShipperStatistics(
    [row(), row({ sourceSite: "LSHI", rowNumber: 2 })],
    baseFilters
  );

  assert.equal(statistics.nombreColis, 2);
  assert.equal(statistics.totalKilogrammes, 20);
  assert.equal(statistics.anomalies.crossSiteCodes, 1);
});

test("exclut tout poids en conflit sans exclure le colis", () => {
  const statistics = calculateShipperStatistics(
    [row(), row({ rowNumber: 3, poidsRaw: "12" })],
    baseFilters
  );

  assert.equal(statistics.nombreColis, 1);
  assert.equal(statistics.totalKilogrammes, 0);
  assert.equal(statistics.parcels[0].poidsKg, null);
  assert.equal(statistics.anomalies.conflictingWeights, 1);
});

test("signale poids, date et code invalides sans corriger la source", () => {
  const statistics = calculateShipperStatistics(
    [
      row({ poidsRaw: "0" }),
      row({ rowNumber: 3, codeColisRaw: "", poidsRaw: "5" }),
      row({
        rowNumber: 4,
        codeColisRaw: "DATE",
        dateRaw: "31/02/2026",
        poidsRaw: "5"
      })
    ],
    baseFilters
  );

  assert.equal(statistics.nombreColis, 1);
  assert.equal(statistics.totalKilogrammes, 0);
  assert.equal(statistics.anomalies.invalidWeights, 1);
  assert.equal(statistics.anomalies.missingCodes, 1);
  assert.equal(statistics.anomalies.invalidDates, 1);
});

test("les deux routes autorisent uniquement GET et autorisent avant toute lecture Google", async () => {
  for (const path of [
    "../src/app/api/admin/shippers/route.ts",
    "../src/app/api/admin/shippers/statistics/route.ts"
  ]) {
    const route = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(route.includes('export const runtime = "nodejs"'));
    assert.ok(route.includes('"Cache-Control": "private, no-store, max-age=0"'));
    assert.ok(route.indexOf("await authorizeAdminRequest") >= 0);
    assert.ok(
      route.indexOf("await authorizeAdminRequest") <
        route.indexOf("await readAdminManifestRows")
    );
    assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(route), false);
  }
});

test("l’autorisation serveur refuse JWT absent, AGENT et ADMIN inactif", async () => {
  const { authorizeAdminRequest } = authorizationModule;
  let resolverCalls = 0;
  const noToken = await authorizeAdminRequest(
    new Request("https://example.test/api/admin/shippers"),
    async () => {
      resolverCalls += 1;
      return null;
    }
  );
  assert.deepEqual(noToken, { authorized: false, status: 401 });
  assert.equal(resolverCalls, 0);

  const invalidJwt = await authorizeAdminRequest(
    new Request("https://example.test/api/admin/shippers", {
      headers: { Authorization: "Bearer invalide" }
    }),
    async () => null
  );
  assert.deepEqual(invalidJwt, { authorized: false, status: 401 });

  const agent = await authorizeAdminRequest(
    new Request("https://example.test/api/admin/shippers", {
      headers: { Authorization: "Bearer valide" }
    }),
    async () => ({
      userId: "user-1",
      profile: { id: "user-1", actif: true, role: "AGENT" }
    })
  );
  assert.deepEqual(agent, { authorized: false, status: 403 });

  const inactiveAdmin = await authorizeAdminRequest(
    new Request("https://example.test/api/admin/shippers", {
      headers: { Authorization: "Bearer valide" }
    }),
    async () => ({
      userId: "user-1",
      profile: { id: "user-1", actif: false, role: "ADMIN" }
    })
  );
  assert.deepEqual(inactiveAdmin, { authorized: false, status: 403 });
});

test("l’autorisation serveur accepte uniquement l’ADMIN actif lié au JWT", async () => {
  const result = await authorizationModule.authorizeAdminRequest(
    new Request("https://example.test/api/admin/shippers", {
      headers: { Authorization: "Bearer valide" }
    }),
    async () => ({
      userId: "user-1",
      profile: { id: "user-1", actif: true, role: " admin " }
    })
  );

  assert.deepEqual(result, { authorized: true, userId: "user-1" });
});
