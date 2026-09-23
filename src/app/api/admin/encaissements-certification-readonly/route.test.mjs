import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const route = readFileSync(join(process.cwd(), "src/app/api/admin/encaissements-certification-readonly/route.ts"), "utf8");

test("façade certification est Admin, GET-only et server-side", () => {
  assert.match(route, /authorizeAdminRequest\(request\)/);
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.match(route, /readAdminManifestRows\(\)/);
  assert.match(route, /readAdminPayments\(\)/);
  assert.match(route, /readBilanOriginMonths\(\)/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /\.\s*(?:insert|update|delete|upsert|rpc)\s*\(/);
});

test("façade ne renvoie que des agrégats et détails read-only non sensibles", () => {
  assert.match(route, /readOnly:\s*true/);
  assert.match(route, /source:\s*"MANIFEST_COO_GLM"/);
  assert.match(route, /diagnosticRows/);
  assert.match(route, /firstFail/);
  assert.match(route, /manifestMatches/);
  assert.doesNotMatch(route, /phone|telephone|email/i);
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /NextResponse\.json\([^)]*SUPABASE_SERVICE_ROLE_KEY/);
});

test("rapprochement manifeste conserve le fallback de montant et les catégories d'identité", () => {
  assert.match(route, /parseFirstAmount\(row\.historicalCurrentPriceFieldRaw, row\.montantAttenduRaw\)/);
  assert.match(route, /MANIFEST_MATCH_MULTIPLE/);
  assert.match(route, /MANIFEST_DESTINATION_MISMATCH/);
  assert.match(route, /MANIFEST_CODE_NOT_FOUND/);
  assert.match(route, /MANIFEST_COHORT_MISMATCH/);
  assert.match(route, /parseFirstAmount\(\.\.\.values/);
});

test("façade expose uniquement les diagnostics F/M/G/L read-only", () => {
  assert.match(route, /manifestFState/);
  assert.match(route, /manifestM/);
  assert.match(route, /manifestMPresent/);
  assert.match(route, /manifestG/);
  assert.match(route, /manifestL/);
  for (const state of ["F_POSITIF", "F_ZERO", "F_VIDE", "F_NULL", "F_NON_NUMERIQUE"]) assert.match(route, new RegExp(state));
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /\.\s*(?:insert|update|delete|upsert|rpc)\s*\(/);
});

test("F_ZERO est rapproché depuis le Manifeste vers toutes les feuilles P1", () => {
  assert.match(route, /buildFZeroAudit\(manifests, payments\)/);
  assert.match(route, /paymentIndex\.get\(code\)/);
  assert.match(route, /paymentIndex\.get\(code\) \?\? \[\]\)\.filter\(\(payment\) => payment\.destination === agency\)/);
  assert.match(route, /F_ZERO_P1_SOLDE_CERTIFIE/);
  assert.match(route, /F_ZERO_P1_PARTIEL_CERTIFIE/);
  assert.match(route, /paymentRequestId/);
  assert.doesNotMatch(route, /fZeroAudit.*\.insert\(|fZeroAudit.*\.update\(|fZeroAudit.*\.upsert\(/s);
});

test("F_ZERO conserve la chronologie P1 comme preuve auxiliaire", () => {
  assert.match(route, /const chronological = \[\.\.\.transactions\]\.sort/);
  assert.match(route, /const finalPayment = chronological\.at\(-1\)/);
  assert.match(route, /else if \(financial\.state === "SOLDÉ"\) classification = "F_ZERO_P1_SOLDE_CERTIFIE"/);
  assert.match(route, /else if \(financial\.state === "PARTIEL"\) classification = "F_ZERO_P1_PARTIEL_CERTIFIE"/);
});

test("un classifieur F/L/M unique alimente F_ZERO et l'audit moderne", () => {
  assert.match(route, /function classifyFinancialState\(\{ F, L, M \}/);
  assert.match(route, /const financial = classifyFinancialState\(\{\s*F: parseAmount\(item\.row\.historicalCurrentPriceFieldRaw/);
  assert.match(route, /const financial = classifyFinancialState\(\{ F: fUsd, L: lUsd, M: mUsd \}\)/);
  assert.match(route, /if \(L === 0 && M > 0\)/);
  assert.match(route, /if \(L > 0 && M === 0\)/);
  assert.match(route, /if \(L > 0 && M > 0\)/);
  assert.match(route, /financialState: financial\.state/);
});

test("audit inverse moderne part du Manifeste et couvre dynamiquement août 2026 → présent", () => {
  assert.match(route, /const MODERN_START_DATE = "2026-08-01"/);
  assert.match(route, /buildModernManifestAudit\(manifests, payments, physicalMatches(?:, cohortId)?\)/);
  assert.match(route, /manifests\.filter\(isModernManifestRow\)/);
  assert.match(route, /const allByCode = new Map/);
  assert.match(route, /allByCode\.get\(code\) \?\? \[\]/);
  assert.match(route, /ModernFinancialState = "SOLDÉ" \| "PARTIEL" \| "NON PAYÉ" \| "FUTURE DETTE" \| "À VÉRIFIER"/);
  assert.match(route, /currentlyPresent/);
  assert.match(route, /everPresent/);
  assert.match(route, /paymentCohortAmbiguous/);
  assert.match(route, /byCohort/);
  assert.doesNotMatch(route, /isModernManifestRow[\s\S]{0,500}\/\^\(AT\|SE\)/);
});

test("le rapprochement moderne accepte une cohorte active et filtre avant agrégation", () => {
  assert.match(route, /searchParams\.get\("cohortId"\)/);
  assert.match(route, /buildModernManifestAudit\(manifests, payments, physicalMatches(?:, cohortId)?\)/);
  assert.match(route, /filter\(\(row\) => \{[\s\S]*selectedCohortId[\s\S]*cohort\.definition\.id === selectedCohortId/);
  assert.match(route, /activeCohortId: selectedCohortId/);
});

test("dettes modernes restent read-only et séparées des cas À VÉRIFIER", () => {
  assert.match(route, /state === "PARTIEL" \|\| row\.state === "NON PAYÉ"/);
  assert.match(route, /let state: ModernFinancialState = "À VÉRIFIER"/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /\.\s*(?:insert|update|delete|upsert|rpc)\s*\(/);
});

test("l'agrégation financière utilise l'état F/L/M unique et ne double-compte pas les créances", () => {
  assert.match(route, /const settled = count\("SOLDÉ"\)/);
  assert.match(route, /const canonicalState = \(state: ModernFinancialState\)/);
  assert.match(route, /const currentDebts = partial \+ unpaidCurrent/);
  assert.match(route, /principal: agencyRows\.length === settled \+ partial \+ unpaid \+ toVerify/);
  assert.match(route, /receivables: currentDebts \+ futureDebts === partial \+ unpaid/);
  assert.doesNotMatch(route, /item\.total === item\.settled \+ item\.partial \+ item\.unpaidCertified \+ item\.futureDebts/);
});

test("expose les identités physiques nécessaires au contrôle AT02326 et AT09826 en lecture seule", () => {
  assert.match(route, /readPhysicalIdentities\(/);
  assert.match(route, /modernCodes/);
  assert.match(route, /readExhaustivePages/);
  assert.match(route, /stockage_forwardings/);
  assert.match(route, /forwardingId/);
  assert.match(route, /originAgency/);
  assert.match(route, /destinationAgency/);
});
