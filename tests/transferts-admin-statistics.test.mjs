import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const typesSource = await readFile(
  new URL("../src/features/transferts/types.ts", import.meta.url),
  "utf8"
);
const typesCompiled = ts.transpileModule(typesSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const typesUrl = `data:text/javascript;base64,${Buffer.from(typesCompiled).toString("base64")}`;
const statisticsSource = (
  await readFile(
    new URL("../src/server/transferts-admin-statistics.ts", import.meta.url),
    "utf8"
  )
)
  .replace('import "server-only";', "")
  .replace(
    'from "@/features/transferts/types";',
    `from "${typesUrl}";`
  );
const statisticsCompiled = ts.transpileModule(statisticsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const statistics = await import(
  `data:text/javascript;base64,${Buffer.from(statisticsCompiled).toString("base64")}`
);

const now = new Date("2026-07-30T12:00:00Z");

function transfer(overrides = {}) {
  return {
    transferId: "00000000-0000-4000-8000-000000000001",
    sentAt: "2026-07-30T08:00:00Z",
    agencyFrom: "FIH",
    agentFrom: "agent@example.com",
    agencyTo: "COO",
    agentTo: "",
    amount: 500,
    currency: "USD",
    fees: 5,
    netExpected: 495,
    service: "RIA",
    maskedCode: "****1234",
    senderName: "Jean",
    beneficiaryName: "Marie",
    status: "ENVOYE",
    codeReceivedBy: "",
    codeReceivedAt: null,
    fundsWithdrawnBy: "",
    fundsWithdrawnAt: null,
    confirmedBy: "",
    confirmedAt: null,
    observation: "",
    createdAt: "2026-07-30T08:00:00Z",
    updatedAt: "2026-07-30T08:00:00Z",
    cancelled: false,
    cancelReason: "",
    ...overrides
  };
}

test("calcule aujourd’hui et le mois en séparant strictement les devises", () => {
  const result = statistics.calculateAdminTransferStatistics(
    [
      transfer(),
      transfer({
        transferId: "2",
        amount: 3_200_000,
        currency: "CDF",
        status: "CODE_RECU",
        agencyFrom: "LSHI"
      }),
      transfer({
        transferId: "3",
        sentAt: "2026-07-10T12:00:00Z",
        amount: 850_000,
        currency: "XOF",
        status: "CONFIRME",
        agencyFrom: "COO",
        agencyTo: "KLZ"
      })
    ],
    now
  );

  assert.equal(result.today.count, 2);
  assert.deepEqual(result.today.amountsByCurrency, {
    USD: 500,
    CDF: 3_200_000,
    XOF: 0
  });
  assert.equal(result.today.statuses.ENVOYE, 1);
  assert.equal(result.today.statuses.CODE_RECU, 1);
  assert.equal(result.currentMonth.count, 3);
  assert.deepEqual(result.currentMonth.amountsByCurrency, {
    USD: 500,
    CDF: 3_200_000,
    XOF: 850_000
  });
});

test("calcule les répartitions source, bénéficiaire, circuit et statut", () => {
  const result = statistics.calculateAdminTransferStatistics(
    [
      transfer(),
      transfer({ transferId: "2", agencyFrom: "FIH", agencyTo: "COO", status: "CONFIRME" }),
      transfer({ transferId: "3", agencyFrom: "COO", agencyTo: "LSHI", currency: "CDF", amount: 10 })
    ],
    now
  ).currentMonth;

  assert.equal(result.byAgencyFrom.FIH, 2);
  assert.equal(result.byAgencyFrom.COO, 1);
  assert.equal(result.byAgencyTo.COO, 2);
  assert.equal(result.byAgencyTo.LSHI, 1);
  assert.equal(result.byCircuit["FIH>COO"].count, 2);
  assert.equal(result.byCircuit["FIH>COO"].statuses.CONFIRME, 1);
  assert.equal(result.byCircuit["COO>LSHI"].amountsByCurrency.CDF, 10);
});

test("conserve toujours les six circuits officiels, y compris sans transfert", () => {
  const result = statistics.calculateAdminTransferStatistics([], now);
  assert.deepEqual(Object.keys(result.currentMonth.byCircuit), [
    "FIH>COO",
    "LSHI>COO",
    "KLZ>COO",
    "COO>FIH",
    "COO>LSHI",
    "COO>KLZ"
  ]);
  for (const circuit of Object.values(result.currentMonth.byCircuit)) {
    assert.equal(circuit.count, 0);
    assert.deepEqual(circuit.amountsByCurrency, { USD: 0, CDF: 0, XOF: 0 });
  }
});

test("respecte minuit dans Africa/Porto-Novo et ignore les dates invalides", () => {
  const result = statistics.calculateAdminTransferStatistics(
    [
      transfer({ transferId: "local-30", sentAt: "2026-07-29T23:00:00Z" }),
      transfer({ transferId: "local-29", sentAt: "2026-07-29T22:59:59Z" }),
      transfer({ transferId: "invalid", sentAt: "date-invalide" })
    ],
    now
  );
  assert.equal(result.todayKey, "2026-07-30");
  assert.equal(result.today.count, 1);
  assert.equal(result.currentMonth.count, 2);
  assert.equal(result.invalidDateCount, 1);
});

test("gère une période vide, aucune donnée et les filtres autorisés", () => {
  const filters = statistics.parseAdminTransferFilters(
    new URLSearchParams({
      period: "CUSTOM",
      from: "2026-08-01",
      to: "2026-08-02",
      agencyFrom: "FIH",
      circuit: "FIH>COO",
      status: "ENVOYE",
      currency: "USD"
    })
  );
  assert.deepEqual(statistics.filterAdminTransfers([transfer()], filters, now), []);
  assert.equal(statistics.calculateAdminTransferStatistics([], now).today.count, 0);
});

test("applique aux cartes le périmètre actif sans reprendre la période générale", () => {
  const transfers = [
    transfer({ transferId: "lshi-today", agencyFrom: "LSHI", amount: 300 }),
    transfer({ transferId: "lshi-month", agencyFrom: "LSHI", sentAt: "2026-07-10T12:00:00Z", amount: 200 }),
    transfer({ transferId: "fih-today", agencyFrom: "FIH", amount: 500 }),
    transfer({ transferId: "lshi-cdf", agencyFrom: "LSHI", currency: "CDF", amount: 1000 })
  ];
  const filters = statistics.parseAdminTransferFilters(
    new URLSearchParams({
      period: "CUSTOM",
      from: "2026-07-01",
      to: "2026-07-01",
      agencyFrom: "LSHI",
      agencyTo: "COO",
      circuit: "LSHI>COO",
      currency: "USD"
    })
  );

  const scoped = statistics.filterAdminTransfersForStatistics(transfers, filters);
  const result = statistics.calculateAdminTransferStatistics(scoped, now);

  assert.deepEqual(scoped.map((item) => item.transferId), ["lshi-today", "lshi-month"]);
  assert.equal(result.today.count, 1);
  assert.equal(result.today.amountsByCurrency.USD, 300);
  assert.equal(result.currentMonth.count, 2);
  assert.equal(result.currentMonth.amountsByCurrency.USD, 500);
  assert.equal(result.currentMonth.byCircuit["LSHI>COO"].count, 2);
});

test("respecte chaque filtre métier des cartes Aujourd’hui et Mois en cours", () => {
  const transfers = [
    transfer({ transferId: "lshi-usd", agencyFrom: "LSHI", agencyTo: "COO", amount: 300 }),
    transfer({ transferId: "fih-usd", agencyFrom: "FIH", agencyTo: "COO", amount: 500 }),
    transfer({ transferId: "lshi-cdf", agencyFrom: "LSHI", agencyTo: "COO", currency: "CDF", amount: 1000, status: "CODE_RECU" }),
    transfer({ transferId: "coo-lshi", agencyFrom: "COO", agencyTo: "LSHI", amount: 200 })
  ];
  const cases = [
    [{}, ["lshi-usd", "fih-usd", "lshi-cdf", "coo-lshi"]],
    [{ agencyFrom: "LSHI" }, ["lshi-usd", "lshi-cdf"]],
    [{ agencyFrom: "FIH" }, ["fih-usd"]],
    [{ agencyTo: "COO" }, ["lshi-usd", "fih-usd", "lshi-cdf"]],
    [{ circuit: "LSHI>COO" }, ["lshi-usd", "lshi-cdf"]],
    [{ status: "CODE_RECU" }, ["lshi-cdf"]],
    [{ currency: "USD" }, ["lshi-usd", "fih-usd", "coo-lshi"]],
    [{ agencyFrom: "LSHI", agencyTo: "COO", circuit: "LSHI>COO" }, ["lshi-usd", "lshi-cdf"]],
    [{ transferId: "LSHI-USD" }, ["lshi-usd"]]
  ];

  for (const [query, expected] of cases) {
    const filters = statistics.parseAdminTransferFilters(
      new URLSearchParams({ period: "THIS_MONTH", ...query })
    );
    assert.deepEqual(
      statistics.filterAdminTransfersForStatistics(transfers, filters).map((item) => item.transferId),
      expected
    );
  }
});

test("calcule les bornes de période dans la convention métier existante", () => {
  const expected = [
    [{ period: "TODAY" }, { from: "2026-07-30", to: "2026-07-30" }],
    [{ period: "THIS_WEEK" }, { from: "2026-07-27", to: "2026-07-30" }],
    [{ period: "THIS_MONTH" }, { from: "2026-07-01", to: "2026-07-30" }],
    [{ period: "CUSTOM", from: "2026-07-10", to: "2026-07-20" }, { from: "2026-07-10", to: "2026-07-20" }]
  ];

  for (const [query, bounds] of expected) {
    const filters = statistics.parseAdminTransferFilters(new URLSearchParams(query));
    assert.deepEqual(statistics.resolveAdminPeriodBounds(filters, now), bounds);
  }
});

test("affiche les libellés français tout en conservant les valeurs techniques", async () => {
  const source = await readFile(
    new URL("../src/features/transferts/admin-transferts-page.tsx", import.meta.url),
    "utf8"
  );
  for (const [value, label] of [
    ["TODAY", "Aujourd’hui"],
    ["THIS_WEEK", "Cette semaine"],
    ["THIS_MONTH", "Ce mois"],
    ["CUSTOM", "Période personnalisée"]
  ]) {
    assert.match(source, new RegExp(`${value}: \\\"${label}`));
  }
  assert.match(source, /customPeriodIncomplete = period === "CUSTOM" && \(!dateFrom \|\| !dateTo\)/);
  assert.match(source, /!authorized \|\| !token\.current \|\| customPeriodIncomplete/);
});

test("refuse proprement les filtres, dates et circuits invalides", () => {
  for (const query of [
    { period: "YEAR" },
    { period: "CUSTOM", from: "2026-07-31", to: "2026-07-01" },
    { period: "CUSTOM", from: "2026-02-30", to: "2026-03-01" },
    { agencyFrom: "ADMIN" },
    { circuit: "FIH>LSHI" },
    { status: "INCONNU" },
    { currency: "EUR" },
    { transferId: "<script>" }
  ]) {
    assert.throws(
      () => statistics.parseAdminTransferFilters(new URLSearchParams(query)),
      statistics.AdminTransferFilterError
    );
  }
});

test("les routes Admin restent GET, contrôlent agence et flag avant Apps Script", async () => {
  const paths = [
    "../src/app/api/admin/transferts/route.ts",
    "../src/app/api/admin/transferts/[transferId]/route.ts",
    "../src/app/api/admin/transferts/audit/route.ts"
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(source.includes("export async function GET"));
    assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(source), false);
    assert.ok(source.indexOf("await authorizeAdminRequest") < source.indexOf("await callTransfertsReadApi"));
    assert.ok(source.indexOf("!authorization.agency") < source.indexOf("await callTransfertsReadApi"));
    assert.ok(source.indexOf("adminEnabled") < source.indexOf("await callTransfertsReadApi"));
    assert.ok(source.includes('state: "NOT_CONFIGURED"'));
    assert.ok(source.includes("ne possède pas encore une agence de traçabilité valide"));
  }
  const listRoute = await readFile(new URL(paths[0], import.meta.url), "utf8");
  assert.ok(listRoute.includes("La consultation administrative des transferts n’est pas encore activée."));
  assert.ok(listRoute.includes("AdminTransferFilterError"));
  assert.ok(listRoute.includes("}, 400)"));
});
