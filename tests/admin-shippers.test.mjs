import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts from "typescript";

const sourceUrl = new URL(
  "../src/features/admin/shippers.ts",
  import.meta.url
);
const source = await readFile(sourceUrl, "utf8");
const testableSource = source
  .replace(
    'import { getSupabaseBrowserClient } from "@/features/agent/supabase";',
    "const getSupabaseBrowserClient = () => { throw new Error('non utilisé dans ces tests'); };"
  )
  .replace(
    'import { authenticatedRead } from "@/features/auth/authenticated-fetch";',
    "const authenticatedRead = () => { throw new Error('non utilisé dans ces tests'); };"
  );
const compiled = ts.transpileModule(testableSource, {
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
  hasVisibleShipperAnomalies,
  normalizeShipperName,
  parseStrictManifestDate,
  parseStrictPositiveWeight
} = await import(moduleUrl);

const authorizationSource = await readFile(
  new URL("../src/server/admin-authorization.ts", import.meta.url),
  "utf8"
);
const compiledAuthorization = ts
  .transpileModule(authorizationSource.replace('import "server-only";', ""), {
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

test("accepte uniquement les formats métier sûrs du poids", () => {
  assert.equal(parseStrictPositiveWeight(10), 10);
  assert.equal(parseStrictPositiveWeight(10.5), 10.5);
  assert.equal(parseStrictPositiveWeight("10"), 10);
  assert.equal(parseStrictPositiveWeight("10.5"), 10.5);
  assert.equal(parseStrictPositiveWeight("10,5"), 10.5);
  assert.equal(parseStrictPositiveWeight("10 KG"), 10);
  assert.equal(parseStrictPositiveWeight("10,5 KGS"), 10.5);
  assert.equal(parseStrictPositiveWeight("  10.5 kg  "), 10.5);
});

test("refuse les poids vides, nuls, négatifs ou ambigus", () => {
  for (const value of [
    "",
    "   ",
    0,
    "0",
    -10,
    "-10",
    "poids inconnu",
    "10 et 12 kg",
    "10 kg 12",
    "=10",
    Number.POSITIVE_INFINITY,
    Number.NaN
  ]) {
    assert.equal(parseStrictPositiveWeight(value), null);
  }
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
  assert.equal(statistics.anomalies.sameAgencyDuplicates, 1);
  assert.deepEqual(statistics.anomalies.duplicateDetails[0], {
    sourceSite: "FIH",
    codeColis: "JL45426",
    occurrences: 2,
    dates: ["2026-07-15", "2026-07-15"],
    weightsKg: [10, 10],
    shippers: ["Jacques NGBANZO"],
    rowNumbers: [2, 3]
  });
});

test("ne signale pas le même code présent une fois dans plusieurs agences", () => {
  const statistics = calculateShipperStatistics(
    [
      row(),
      row({ sourceSite: "LSHI", rowNumber: 2 }),
      row({ sourceSite: "KLZ", rowNumber: 2 })
    ],
    baseFilters
  );

  assert.equal(statistics.nombreColis, 3);
  assert.equal(statistics.totalKilogrammes, 30);
  assert.equal(statistics.anomalies.sameAgencyDuplicates, 0);
  assert.deepEqual(statistics.anomalies.duplicateDetails, []);
});

test("calcule les kilogrammes, la moyenne, les sites et les destinations", () => {
  const statistics = calculateShipperStatistics(
    [
      row({ poidsRaw: "10 KGS" }),
      row({
        sourceSite: "LSHI",
        rowNumber: 2,
        codeColisRaw: "LSHI-1",
        poidsRaw: "10,5 kg"
      }),
      row({
        sourceSite: "KLZ",
        rowNumber: 2,
        codeColisRaw: "KLZ-1",
        poidsRaw: 9.5
      })
    ],
    baseFilters
  );

  assert.equal(statistics.nombreColis, 3);
  assert.equal(statistics.totalKilogrammes, 30);
  assert.equal(statistics.poidsMoyenKg, 10);
  assert.deepEqual(statistics.bySite.FIH, { colis: 1, kilogrammes: 10 });
  assert.deepEqual(statistics.bySite.LSHI, { colis: 1, kilogrammes: 10.5 });
  assert.deepEqual(statistics.bySite.KLZ, { colis: 1, kilogrammes: 9.5 });
  assert.deepEqual(statistics.byDestination.Kinshasa, {
    colis: 1,
    kilogrammes: 10
  });
  assert.deepEqual(statistics.byDestination.Lubumbashi, {
    colis: 1,
    kilogrammes: 10.5
  });
  assert.deepEqual(statistics.byDestination.Kolwezi, {
    colis: 1,
    kilogrammes: 9.5
  });
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
  assert.deepEqual(statistics.anomalies.invalidDateDetails, [
    {
      sourceSite: "FIH",
      rowNumber: 4,
      codeColis: "DATE",
      expediteur: "Jacques NGBANZO",
      rawDate: "31/02/2026"
    }
  ]);
});

test("limite les détails d’anomalies aux filtres expéditeur, site et destination", () => {
  const statistics = calculateShipperStatistics(
    [
      row({ dateRaw: "31/02/2026", codeColisRaw: "FIH-INVALIDE" }),
      row({ sourceSite: "LSHI", rowNumber: 2, dateRaw: "32/07/2026", codeColisRaw: "LSHI-INVALIDE" }),
      row({ rowNumber: 3, expediteurRaw: "Autre Expéditeur", dateRaw: "32/07/2026", codeColisRaw: "AUTRE" })
    ],
    { ...baseFilters, site: "FIH", destination: "Kinshasa" }
  );

  assert.equal(statistics.anomalies.invalidDates, 1);
  assert.equal(statistics.anomalies.invalidDateDetails[0].codeColis, "FIH-INVALIDE");
});

test("masque les anomalies globales non attribuables à l’expéditeur recherché", () => {
  const statistics = calculateShipperStatistics(
    [
      row(),
      row({
        rowNumber: 3,
        expediteurRaw: "",
        codeColisRaw: "SANS-EXPEDITEUR",
        poidsRaw: ""
      }),
      row({
        rowNumber: 4,
        expediteurRaw: "Autre Expéditeur",
        codeColisRaw: "AUTRE",
        poidsRaw: "invalide"
      })
    ],
    baseFilters
  );

  assert.equal(statistics.nombreColis, 1);
  assert.equal(statistics.totalKilogrammes, 10);
  assert.equal(statistics.anomalies.missingShippers, 0);
  assert.equal(hasVisibleShipperAnomalies(statistics.anomalies), false);
});

test("affiche une anomalie directement liée à un colis retenu", () => {
  const statistics = calculateShipperStatistics(
    [row({ poidsRaw: "invalide" })],
    baseFilters
  );

  assert.equal(statistics.nombreColis, 1);
  assert.equal(statistics.totalKilogrammes, 0);
  assert.equal(statistics.anomalies.invalidWeights, 1);
  assert.equal(hasVisibleShipperAnomalies(statistics.anomalies), true);
});

test("n’affiche pas les anomalies hors période ou d’un autre expéditeur", () => {
  const statistics = calculateShipperStatistics(
    [
      row(),
      row({
        rowNumber: 3,
        dateRaw: "30/06/2026",
        codeColisRaw: "HORS-PERIODE",
        poidsRaw: "invalide"
      }),
      row({
        rowNumber: 4,
        expediteurRaw: "Autre Expéditeur",
        codeColisRaw: "AUTRE",
        poidsRaw: "invalide"
      })
    ],
    baseFilters
  );

  assert.equal(statistics.nombreColis, 1);
  assert.equal(statistics.totalKilogrammes, 10);
  assert.equal(statistics.anomalies.invalidWeights, 0);
  assert.equal(hasVisibleShipperAnomalies(statistics.anomalies), false);
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
      email: "admin@example.com",
      profile: { id: "user-1", actif: true, role: " admin " }
    })
  );

  assert.deepEqual(result, {
    authorized: true,
    userId: "user-1",
    email: "admin@example.com",
    role: "ADMIN",
    agency: null
  });
});

test("le rapport UI détaille les dates invalides et les doublons par agence", async () => {
  const view = await readFile(
    new URL("../src/features/admin/shipper-statistics.tsx", import.meta.url),
    "utf8"
  );

  assert.match(view, /Voir les dates invalides/);
  assert.match(view, /Doublons dans la même agence/);
  assert.match(view, /Voir les doublons/);
  assert.doesNotMatch(view, /Codes présents dans plusieurs sites/);
});
