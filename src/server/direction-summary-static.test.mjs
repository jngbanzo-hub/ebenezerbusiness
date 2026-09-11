import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./direction-summary.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("./direction-summary-auth.ts", import.meta.url), "utf8");

test("le résumé réutilise exclusivement les quatre sources officielles", () => {
  assert.match(source, /createServerCashDashboardSource\(\)\.readAdmin\(businessDate\)/);
  assert.match(source, /readAdminExpenses/);
  assert.match(source, /buildDailyAgencyReport/);
  assert.match(source, /buildAdminBilan\(query, SERVICE_ACTOR\)/);
  assert.match(source, /readAdminStorage\(\)/);
  assert.doesNotMatch(source, /Encaissements\s*-\s*Dépenses/i);
});

test("le bénéfice officiel est projeté sans formule parallèle", () => {
  assert.match(source, /row\.amountUsd/);
  assert.match(source, /finalProfit\.consolidatedUsd/);
  assert.match(source, /BILAN_FINAL_PROFIT_CONSOLIDATED/);
  assert.doesNotMatch(source, /paymentsTotal\s*-|receivedAmount\s*-/);
});

test("le mois métier résout une cohorte existante et sa période complète", () => {
  assert.match(source, /businessDatePortoNovo\(now\)/);
  assert.match(source, /resolveDirectionScope\(businessDate, BILAN_COHORTS\)/);
  assert.match(source, /cohort \? isolated/);
  assert.doesNotMatch(source, /month\s*-\s*1|fallback.*cohort/i);
});

test("COO reste N/A et les indisponibilités restent nulles", () => {
  assert.match(source, /agency === "COO" \? notApplicableCash/);
  assert.match(source, /agency === "COO" \? notApplicableProfit/);
  assert.match(source, /agency === "COO" \? notApplicableStock/);
  assert.match(source, /status: "UNAVAILABLE" as const, amountUsd: null/);
  assert.match(source, /status: "UNAVAILABLE" as const, parcels: null, weightKg: null/);
});

test("les dépenses restent ventilées par devise", () => {
  assert.match(source, /report\.expensesByCurrency/);
  assert.match(source, /sumCurrencies/);
  assert.doesNotMatch(source, /exchangeRate|convertCurrency|tauxDeChange/i);
});

test("l'identité technique Direction respecte le contrat UUID v4 Dépenses", () => {
  const actorId = source.match(/const SERVICE_ACTOR:[\s\S]*?userId:\s*"([^"]+)"/)?.[1];
  assert.ok(actorId, "actor.id Direction absent");
  assert.match(actorId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(source, /email:\s*"whatsapp-direction-reader@internal\.eeb"/);
  assert.match(source, /role:\s*"ADMIN"/);
  assert.match(source, /readAdminExpenses\(SERVICE_ACTOR,/);
});

test("une réponse normale conserve Dépenses et BILAN disponibles", () => {
  assert.match(source, /expenses \? Object\.freeze\(\{ status: "AVAILABLE" as const/);
  assert.match(source, /profit \? Object\.freeze\(\{ status: "AVAILABLE" as const/);
  assert.match(source, /expenses: expenses \? "AVAILABLE" : "UNAVAILABLE"/);
  assert.match(source, /bilan: profit \? "AVAILABLE" : "UNAVAILABLE"/);
  assert.match(source, /buildAdminBilan\(query, SERVICE_ACTOR\)/);
});

test("l'authentification utilise un secret serveur et une comparaison temporelle sûre", () => {
  assert.match(auth, /WHATSAPP_DIRECTION_READER_TOKEN/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /MAX_REQUESTS_PER_WINDOW/);
  assert.doesNotMatch(auth, /NEXT_PUBLIC_/);
});

test("aucune mutation métier n'est introduite", () => {
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.doesNotMatch(source, /POST|PUT|PATCH|DELETE/);
});
