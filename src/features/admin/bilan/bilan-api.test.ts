import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AdminAuthorizationResult } from "@/server/admin-authorization";

import { BILAN_ALLOWED_METHODS, parseBilanApiQuery } from "./bilan-api-query";
import { createBilanGetHandler } from "./bilan-route-handler";

const admin: AdminAuthorizationResult = { authorized: true, userId: "admin-1", email: "admin@example.com", role: "ADMIN", agency: "COO" };

test("GET Admin autorisé retourne une réponse privée no-store", async () => {
  const response = await handler(admin)(request("?cohort=AT&startDate=2026-08-01&endDate=2026-08-31"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal((await response.json()).meta.status, "PROVISOIRE");
});

test("Auth absente et non-Admin sont refusés selon le mécanisme existant", async () => {
  assert.equal((await handler({ authorized: false, status: 401 })(request("?cohort=AT"))).status, 401);
  assert.equal((await handler({ authorized: false, status: 403 })(request("?cohort=AT"))).status, 403);
});

test("une source indisponible retourne 503 sans données fabriquées", async () => {
  const response = await createBilanGetHandler({ authorize: async () => admin, build: async () => { throw new Error("BILAN_SOURCE_UNAVAILABLE"); } })(request("?cohort=AT"));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "BILAN_SOURCE_UNAVAILABLE");
});

test("résout explicitement AT sans déduire une cohorte depuis la période", () => {
  const parsed = parseBilanApiQuery("https://example.test/api/admin/bilan?cohort=AT&startDate=2026-09-01&endDate=2026-09-30");
  assert.equal(parsed.state, "VALID");
  if (parsed.state === "VALID") {
    assert.equal(parsed.query.cohort.id, "2026-08");
    assert.deepEqual(parsed.query.period, { from: "2026-09-01", to: "2026-09-30" });
  }
});

test("accepte year+month uniquement via le registre explicite", () => {
  const parsed = parseBilanApiQuery("https://example.test/api/admin/bilan?year=2026&month=8");
  assert.equal(parsed.state, "VALID");
  if (parsed.state === "VALID") assert.equal(parsed.query.cohort.prefix, "AT");
});

test("cohorte inconnue retourne COHORTE_NON_RESOLUE sans appeler les sources", async () => {
  let builds = 0;
  const response = await createBilanGetHandler({ authorize: async () => admin, build: async () => { builds += 1; return {}; } })(request("?cohort=XX"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).code, "COHORTE_NON_RESOLUE");
  assert.equal(builds, 0);
});

test("refuse paramètres, mois et périodes invalides", () => {
  for (const query of ["", "?year=2026&month=13", "?cohort=AT&year=2026&month=8", "?cohort=AT&startDate=2026-08-01", "?cohort=AT&startDate=2026-08-31&endDate=2026-08-01", "?cohort=AT&extra=1"]) {
    assert.equal(parseBilanApiQuery(`https://example.test/api/admin/bilan${query}`).state, "INVALID");
  }
});

test("préserve la réponse août : 7 893/7 892 kg et transit 775/1 317,50", async () => {
  const response = await handler(admin)(request("?cohort=AT&startDate=2026-08-01&endDate=2026-08-31"));
  const payload = await response.json();
  assert.equal(payload.activity.periodRegisteredWeightKg, 7893);
  assert.equal(payload.activity.totalCohortWeightKg, 7892);
  assert.equal(payload.activity.cohortPeriodDifferenceKg, 1);
  assert.deepEqual(payload.transit, { shipments: 23, officialWeightKg: 775, rateUsdPerKg: 1.7, amountUsd: 1317.5, status: "CERTIFIE", additionalFihProofRequired: false });
});

test("expose charges non imputées, TF Bénin et devises séparées", async () => {
  const payload = await (await handler(admin)(request("?cohort=AT&startDate=2026-08-01&endDate=2026-08-31"))).json();
  assert.equal(payload.directCosts.totalUnallocatedUsd, 10);
  assert.deepEqual(payload.periodExpenses.byCurrency, { USD: 20, CDF: 3000 });
  assert.deepEqual(payload.treasury.tfBeninByCurrency, { USD: 100 });
});

test("expose les anomalies avec les six champs d’audit", async () => {
  const payload = await (await handler(admin)(request("?cohort=AT"))).json();
  assert.deepEqual(Object.keys(payload.dataQuality[0]), ["type", "source", "reference", "agency", "cohortId", "impact"]);
});

test("la route n’exporte que GET comme méthode métier", () => {
  const source = readFileSync("src/app/api/admin/bilan/route.ts", "utf8");
  assert.deepEqual(BILAN_ALLOWED_METHODS, ["GET"]);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.doesNotMatch(source, new RegExp(`export\\s+(?:async\\s+function|const)\\s+${method}\\b`));
});

test("aucune primitive d’écriture n’est présente dans l’API BILAN", () => {
  const files = ["src/features/admin/bilan/bilan-service.ts", "src/features/admin/bilan/bilan-route-handler.ts", "src/app/api/admin/bilan/route.ts"];
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});

function handler(auth: AdminAuthorizationResult) {
  return createBilanGetHandler({ authorize: async () => auth, build: async () => fixtureResponse() });
}
function request(query: string) { return new Request(`https://example.test/api/admin/bilan${query}`, { headers: { Authorization: "Bearer test" } }); }
function fixtureResponse() {
  return {
    meta: { status: "PROVISOIRE" },
    activity: { periodRegisteredWeightKg: 7893, totalCohortWeightKg: 7892, cohortPeriodDifferenceKg: 1 },
    transit: { shipments: 23, officialWeightKg: 775, rateUsdPerKg: 1.7, amountUsd: 1317.5, status: "CERTIFIE", additionalFihProofRequired: false },
    directCosts: { totalUnallocatedUsd: 10 },
    periodExpenses: { byCurrency: { USD: 20, CDF: 3000 } },
    treasury: { tfBeninByCurrency: { USD: 100 } },
    dataQuality: [{ type: "CHARGE_DIRECTE_NON_IMPUTEE", source: "DÉPENSES", reference: "DEP:1", agency: "KLZ", cohortId: "2026-08", impact: "Marge provisoire" }]
  };
}
