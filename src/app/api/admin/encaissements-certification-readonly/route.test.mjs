import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

const route = readFileSync(join(process.cwd(), "src/app/api/admin/encaissements-certification-readonly/route.ts"), "utf8");
const facade = readFileSync(join(process.cwd(), "src/features/admin/encaissements-certification-readonly-page.tsx"), "utf8");

test("façade certification est Admin, GET-only et server-side", () => {
  assert.match(route, /authorizeAdminRequest\(request\)/);
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.match(route, /readCanonicalPaymentManifestRows\(\)/);
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

test("audit inverse moderne part du Manifeste et couvre les cohortes du registre", () => {
  assert.match(route, /buildModernManifestAudit\(manifests, payments, physicalMatches(?:, cohortId)?(?:, physicalSourceState)?\)/);
  assert.match(route, /manifests\.filter\(isModernManifestRow\)/);
  assert.match(route, /const paymentsByIdentity = new Map/);
  assert.match(route, /paymentsByIdentity\.get\(identityKey\) \?\? \[\]/);
  assert.match(route, /ModernFinancialState = "SOLDÉ" \| "PARTIEL" \| "NON PAYÉ" \| "FUTURE DETTE" \| "À VÉRIFIER" \| "CAS_ISOLE_PREUVE_PHYSIQUE_INSUFFISANTE"/);
  assert.match(route, /physicalByIdentity/);
  assert.match(route, /PREUVES_PHYSIQUES_CONTRADICTOIRES_OU_AGENCE_DIFFERENTE/);
  assert.match(route, /currentlyPresent/);
  assert.match(route, /everPresent/);
  assert.match(route, /cohortAmbiguous/);
  assert.match(route, /byCohort/);
  assert.doesNotMatch(route, /isModernManifestRow[\s\S]{0,500}\/\^\(AT\|SE\)/);
});

test("le rapprochement moderne accepte une cohorte active et filtre avant agrégation", () => {
  assert.match(route, /searchParams\.get\("cohortId"\)/);
  assert.match(route, /buildModernManifestAudit\(manifests, payments, physicalMatches(?:, cohortId)?(?:, physicalSourceState)?\)/);
  assert.match(route, /filter\(\(row\) => \{[\s\S]*selectedCohortId[\s\S]*cohort\.definition\.id === selectedCohortId/);
  assert.match(route, /activeCohortId: selectedCohortId/);
});

test("dettes modernes restent read-only et séparées des cas À VÉRIFIER", () => {
  assert.match(route, /state === "PARTIEL" \|\| row\.state === "NON PAYÉ"/);
  assert.match(route, /let state: ModernFinancialState = "À VÉRIFIER"/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /\.\s*(?:insert|update|delete|upsert|rpc)\s*\(/);
});

test("une lecture physique indisponible isole la créance et ne devient jamais une future dette", () => {
  assert.match(route, /physicalSourceState/);
  assert.match(route, /STOCKAGE_V2_SOURCE_INDISPONIBLE/);
  assert.match(route, /physicalSourceState !== "FOUND"/);
  assert.match(route, /state = "CAS_ISOLE_PREUVE_PHYSIQUE_INSUFFISANTE"/);
});

test("les identités physiques contradictoires peuvent être isolées sans changer leur état financier", () => {
  assert.match(route, /physical\.length === 0 && physicalElsewhere\.length > 0/);
  assert.match(route, /physicalIdentityAmbiguous/);
  assert.match(route, /IDENTITE_NATIVE_FORWARDING_AMBIGUE/);
  assert.match(route, /financialState: financial\.state/);
  assert.match(route, /isolatedPhysicalRows/);
});

test("une absence de ligne physique n'est pas une preuve de non-arrivée", () => {
  assert.match(route, /physicalSourceState !== "FOUND"/);
  assert.match(route, /CHRONOLOGIE_PHYSIQUE_INSUFFISANTE/);
  assert.doesNotMatch(route, /state = "FUTURE DETTE"; reason = "JAMAIS_RECU_STOCKAGE_V2"/);
  assert.match(route, /physical\.length === 0 && physicalElsewhere\.length > 0/);
  assert.doesNotMatch(route, /cohort\.definition\.id === "2026-08"/);
  assert.doesNotMatch(route, /sourceSite === "FIH"/);
});

test("les preuves P1 et physiques sont indexées par cohorte, code exact et agence", () => {
  assert.match(route, /const eligibleRows = manifests\.filter\(isModernManifestRow\)/);
  assert.match(route, /const modernRows = eligibleRows\.filter/);
  assert.match(route, /cohortsByAgencyCode/);
  assert.match(route, /cohorts\?\.size !== 1/);
  assert.match(route, /const identityKey = `\$\{row\.sourceSite\.trim\(\)\.toUpperCase\(\)\}:\$\{cohort\?\.state === "RESOLVED"/);
  assert.match(route, /physicalByIdentity\.get\(identityKey\)/);
  assert.match(route, /COHORTE_P1_OU_PHYSIQUE_AMBIGUE/);
  assert.doesNotMatch(route, /allByCode\.get\(code\)/);
  assert.doesNotMatch(route, /physicalByCode\.get\(/);
});

test("la preuve historique exige un événement d'arrivée physique reconnu", () => {
  assert.match(route, /PHYSICAL_ARRIVAL_EVENTS\.has\(String\(event\.event_type/);
  assert.match(route, /MANUAL_ARRIVAL_RECORDED/);
  assert.match(route, /ARRIVAGE_ACHEMINEMENT/);
  assert.match(route, /FORWARDING_ARRIVED/);
});

test("la façade ne présente pas une trace sans parcel_id comme native", () => {
  assert.match(facade, /match\.forwardingId \? "FORWARDING" : match\.parcelId \? "NATIVE" : "NON RÉSOLUE"/);
});

test("le périmètre moderne commence à août 2026 sans liste de mois codée en dur", () => {
  assert.match(route, /isModernCohort/);
  assert.match(route, /cohort\.definition\.year \* 12 \+ cohort\.definition\.month >= 2026 \* 12 \+ 8/);
  assert.match(route, /!selectedCohortId \|\| \(cohort\?\.state === "RESOLVED" && cohort\.definition\.id === selectedCohortId\)/);
  assert.doesNotMatch(route, /(?:AT|SE)\s*\+\s*(?:SE|OT|NV)/);
});

test("l'agrégation financière utilise l'état F/L/M unique et ne double-compte pas les créances", () => {
  assert.match(route, /financialState === "SOLDÉ"/);
  assert.match(route, /const unpaid = agencyRows\.filter\(\(row\) => row\.financialState === "NON PAYÉ"\)\.length/);
  assert.match(route, /const currentDebts = agencyRows\.filter\(\(row\) => row\.state === "PARTIEL" \|\| row\.state === "NON PAYÉ"\)\.length/);
  assert.match(route, /principal: agencyRows\.length === settled \+ partial \+ unpaid \+ toVerify/);
  assert.match(route, /receivables: currentDebts \+ futureDebts \+ isolatedPhysical === partial \+ unpaid/);
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

function loadModernAudit() {
  const start = route.indexOf("function buildModernManifestAudit(");
  const end = route.indexOf("\nfunction deduplicatePayments(", start);
  assert.ok(start >= 0 && end > start);
  const source = `${route.slice(start, end)}\nglobalThis.buildModernManifestAudit = buildModernManifestAudit;`;
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const context = {
    exactCode: value => String(value ?? "").trim().toUpperCase(),
    parseDate: value => String(value ?? "").slice(0, 10),
    isModernManifestRow: row => Boolean(row.codeColisRaw && row.dateRaw),
    resolveCohort: (_code, year) => ({ state: "RESOLVED", definition: { id: `${year}-08`, year, month: 8 } }),
    isModernCohort: cohort => cohort.definition.year >= 2026,
    classifyManifestF: value => Number(value) > 0 ? "F_POSITIF" : "F_ZERO",
    parseAmount: value => value === null || value === undefined || value === "" ? null : Number(value),
    classifyFinancialState: ({ L, M }) => L === 0 && M > 0
      ? { state: "SOLDÉ", commercialPrice: M, paid: M, remaining: 0 }
      : L > 0 && M === 0
        ? { state: "NON PAYÉ", commercialPrice: L, paid: 0, remaining: L }
        : L > 0 && M > 0
          ? { state: "PARTIEL", commercialPrice: L + M, paid: M, remaining: L }
          : { state: "À VÉRIFIER", commercialPrice: null, paid: M, remaining: L },
    deduplicatePayments: values => values,
    round: value => Math.round(value * 100) / 100
  };
  vm.runInNewContext(compiled, context);
  return context.buildModernManifestAudit;
}

function manifest(agency, code, year, remaining, paid) {
  return { sourceSite: agency, codeColisRaw: code, dateRaw: `${year}-08-01`, historicalCurrentPriceFieldRaw: remaining, historicalRemainingAmountRaw: remaining, historicalPaidAmountRaw: paid };
}

function physical(agency, code, parcelId, forwardingId = null) {
  return { agency, trackingCode: code, parcelId, forwardingId, currentlyPresent: false, historicallyReceived: true, everPresent: true, physicalEvidence: ["PARCEL_V2"] };
}

test("même code et agence dans deux cohortes : aucune preuve P1 ou V2 empruntée", () => {
  const build = loadModernAudit();
  const payments = [{ code: "AT05826", destination: "KLZ", agency: "KLZ", amount: 40, dateKey: "2027-01-01", id: "p1", paymentRequestId: "r1" }];
  const result = build([manifest("KLZ", "AT05826", 2026, 99, 0), manifest("KLZ", "AT05826", 2027, 99, 0)], payments, [physical("KLZ", "AT05826", "parcel-1")], "2026-08");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].state, "CAS_ISOLE_PREUVE_PHYSIQUE_INSUFFISANTE");
  assert.equal(result.rows[0].reason, "COHORTE_P1_OU_PHYSIQUE_AMBIGUE");
  assert.equal(result.rows[0].transactions.length, 0);
  assert.equal(result.rows[0].physicalMatches.length, 0);
});

test("FIH/LSHI et natif/forwarding restent des identités physiques distinctes", () => {
  const build = loadModernAudit();
  const result = build(
    [manifest("FIH", "AT02326", 2026, 20, 0), manifest("LSHI", "AT02326", 2026, 0, 40)],
    [],
    [physical("FIH", "AT02326", "native"), physical("FIH", "AT02326", "forwarded", "forwarding-1"), physical("LSHI", "AT02326", "lshi")]
  );
  const fih = result.rows.find(row => row.sourceSheet === "FIH");
  const lshi = result.rows.find(row => row.sourceSheet === "LSHI");
  assert.equal(fih.reason, "IDENTITE_NATIVE_FORWARDING_AMBIGUE");
  assert.equal(fih.state, "CAS_ISOLE_PREUVE_PHYSIQUE_INSUFFISANTE");
  assert.equal(lshi.state, "SOLDÉ");
  assert.equal(lshi.physicalMatches.length, 1);
});

test("aucune présence V2 ne prouve pas FUTURE DETTE ; SOLDÉ reste prioritaire", () => {
  const build = loadModernAudit();
  const result = build([manifest("FIH", "AT00226", 2026, 13, 0), manifest("LSHI", "AT05826", 2026, 0, 40)], [], []);
  assert.equal(result.rows.find(row => row.sourceSheet === "FIH").state, "CAS_ISOLE_PREUVE_PHYSIQUE_INSUFFISANTE");
  assert.equal(result.rows.find(row => row.sourceSheet === "LSHI").state, "SOLDÉ");
  assert.equal(result.byAgency.FIH.futureDebts, 0);
  assert.equal(result.byAgency.FIH.conservation.receivables, "PASS");
});

test("le suffixe du code et l'agence P1 ne sont jamais fusionnés", () => {
  const build = loadModernAudit();
  const payments = [{ code: "AT00826B", destination: "FIH", agency: "FIH", amount: 10, dateKey: "2026-09-01", id: "p2", paymentRequestId: "r2" }];
  const result = build(
    [manifest("FIH", "AT00826", 2026, 10, 0), manifest("FIH", "AT00826B", 2026, 10, 0), manifest("KLZ", "AT00826B", 2026, 10, 0)],
    payments,
    [physical("FIH", "AT00826B", "parcel-b"), physical("KLZ", "AT00826B", "parcel-klz")]
  );
  const plain = result.rows.find(row => row.sourceSheet === "FIH" && row.code === "AT00826");
  const suffixed = result.rows.find(row => row.sourceSheet === "FIH" && row.code === "AT00826B");
  const klz = result.rows.find(row => row.sourceSheet === "KLZ");
  assert.equal(plain.transactions.length, 0);
  assert.equal(plain.physicalMatches.length, 0);
  assert.equal(suffixed.transactions.length, 1);
  assert.equal(suffixed.physicalMatches.length, 1);
  assert.equal(klz.transactions.length, 0);
  assert.equal(klz.physicalMatches.length, 1);
});
