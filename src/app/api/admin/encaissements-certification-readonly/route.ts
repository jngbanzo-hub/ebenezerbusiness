import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { ManifestShipperRow } from "@/features/admin/types";
import { resolveCohort, withBilanCohorts } from "@/features/admin/bilan/cohort-registry";
import { readBilanOriginMonths } from "@/server/bilan-origin-months";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminManifestRows } from "@/server/admin-manifest-sheets";
import { readAdminPayments } from "@/server/admin-payments-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HISTORICAL_PREFIXES = new Set(["MR", "AV", "MA", "JN", "JL"]);
const TARGETS = [
  ["KLZ", "MA00126"],
  ["KLZ", "JN00126"],
  ["KLZ", "JL00126"],
  ["FIH", "MR11826"],
  ["FIH", "AT02326"],
  ["LSHI", "AT02326"],
  ["KLZ", "AT02326"]
] as const;

type Agency = "FIH" | "LSHI" | "KLZ";
type CertificationState = "PAYE_CERTIFIE" | "RESTE_A_ENCAISSER_CERTIFIE" | "PAIEMENT_HISTORIQUE_NON_CERTIFIE" | "DONNEES_INSUFFISANTES";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) return jsonError("Accès interdit.", authorization.status);

    const [registry, manifests, rawPayments] = await Promise.all([
      readBilanOriginMonths(),
      readAdminManifestRows(),
      readAdminPayments()
    ]);
    const payments = rawPayments.map(normalizePayment);

    const definitions = registry.filter((item) => item.active).map((item) => ({
      id: item.id as `${number}-${string}`,
      prefix: item.prefix,
      year: item.year,
      month: item.month,
      label: item.label
    }));

    const result = withBilanCohorts(definitions, () => buildReport(manifests, payments));
    const physical = await readPhysicalIdentities(["AT02326"]);
    return NextResponse.json({ ...result, physicalIdentities: physical }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return jsonError("Certification temporairement indisponible.", 503);
  }
}

type PhysicalIdentity = {
  agency: string;
  trackingCode: string;
  parcelId: string | null;
  forwardingId: string | null;
  originAgency: string | null;
  destinationAgency: string | null;
  weightKg: number | null;
  deliveryStatus: string | null;
  paymentRequestId: string | null;
  orchestrationState: string | null;
};

async function readPhysicalIdentities(codes: readonly string[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return { state: "UNAVAILABLE" as const, matches: [] as PhysicalIdentity[] };
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
  const [{ data: parcels, error: parcelsError }, { data: forwardings, error: forwardingsError }, { data: orchestrations, error: orchestrationsError }] = await Promise.all([
    client.from("stockage_parcels").select("parcel_id,forwarding_id,tracking_code,agency,canonical_weight_kg,delivery_status").in("tracking_code", codes),
    client.from("stockage_forwardings").select("forwarding_id,original_tracking_code,origin_agency,destination_agency").in("original_tracking_code", codes),
    client.from("stockage_payment_orchestrations").select("request_id,tracking_code,agency,state,parcel_id,forwarding_id").in("tracking_code", codes)
  ]);
  if (parcelsError || forwardingsError || orchestrationsError) return { state: "UNAVAILABLE" as const, matches: [] as PhysicalIdentity[] };
  const forwardingById = new Map((forwardings ?? []).map((row) => [String(row.forwarding_id), row]));
  const orchestrationRows = (orchestrations ?? []) as Array<Record<string, unknown>>;
  const matches = (parcels ?? []).map((row) => {
    const forwarding = row.forwarding_id ? forwardingById.get(String(row.forwarding_id)) : null;
    const orchestration = orchestrationRows.find((candidate) => String(candidate.agency ?? "") === String(row.agency ?? "") && String(candidate.tracking_code ?? "") === String(row.tracking_code ?? "") && (!row.forwarding_id || String(candidate.forwarding_id ?? "") === String(row.forwarding_id)));
    return {
      agency: String(row.agency ?? ""), trackingCode: String(row.tracking_code ?? ""), parcelId: row.parcel_id ? String(row.parcel_id) : null,
      forwardingId: row.forwarding_id ? String(row.forwarding_id) : null,
      originAgency: forwarding?.origin_agency ? String(forwarding.origin_agency) : null,
      destinationAgency: forwarding?.destination_agency ? String(forwarding.destination_agency) : null,
      weightKg: Number.isFinite(Number(row.canonical_weight_kg)) ? Number(row.canonical_weight_kg) : null,
      deliveryStatus: row.delivery_status ? String(row.delivery_status) : null,
      paymentRequestId: orchestration?.request_id ? String(orchestration.request_id) : null,
      orchestrationState: orchestration?.state ? String(orchestration.state) : null
    } satisfies PhysicalIdentity;
  });
  return { state: "FOUND" as const, matches };
}

function buildReport(manifests: readonly ManifestShipperRow[], payments: readonly ReturnType<typeof normalizePayment>[]) {
  const rows = manifests.map((row) => certifyHistoricalRow(row));
  const targets = TARGETS.map(([sheet, code]) => {
    const matches = rows.filter((row) => row.sheet === sheet && row.code === code);
    return {
      sheet,
      code,
      matches: matches.map(sanitizeEvidence),
      state: matches.length === 1 ? matches[0].state : "DONNEES_INSUFFISANTES",
      reasons: matches.length === 1 ? matches[0].reasons : ["IDENTITE_MANIFESTE_AMBIGUE_OU_ABSENTE"]
    };
  });

  const byAgency = Object.fromEntries((["FIH", "LSHI", "KLZ"] as const).map((agency) => {
    const certified = rows.filter((row) => row.sheet === agency && (row.state === "PAYE_CERTIFIE" || row.state === "RESTE_A_ENCAISSER_CERTIFIE"));
    const expectedValues = certified.map((row) => row.expectedUsd);
    const paidValues = certified.map((row) => row.paidUsd);
    const remainingValues = certified.map((row) => row.remainingUsd);
    return [agency, {
      certifiedExpectedUsd: certified.length && expectedValues.every((value) => value !== null) ? round(expectedValues.reduce((sum, value) => sum + (value ?? 0), 0)) : null,
      certifiedPaidUsd: certified.length && paidValues.every((value) => value !== null) ? round(paidValues.reduce((sum, value) => sum + (value ?? 0), 0)) : null,
      certifiedRemainingUsd: certified.length && remainingValues.every((value) => value !== null) ? round(remainingValues.reduce((sum, value) => sum + (value ?? 0), 0)) : null,
      paidIdentityCount: certified.filter((row) => row.state === "PAYE_CERTIFIE").length,
      remainingIdentityCount: certified.filter((row) => row.state === "RESTE_A_ENCAISSER_CERTIFIE").length,
      historicalNonCertifiedCount: rows.filter((row) => row.sheet === agency && row.state === "PAIEMENT_HISTORIQUE_NON_CERTIFIE").length,
      insufficientDataCount: rows.filter((row) => row.sheet === agency && row.state === "DONNEES_INSUFFISANTES").length
    }];
  })) as Record<Agency, unknown>;

  const p1Checks = {
    AT14526: paymentSum(payments, "AT14526", { COO: 17, KLZ: 16 }),
    AT18826: paymentSum(payments, "AT18826", { COO: 50, FIH: 4 })
  };

  return {
    readOnly: true,
    source: "MANIFEST_COO_GLM",
    sheets: { FIH: true, LSHI: true, KLZ: true },
    fields: { A: true, B: true, E: true, F: true, G: true, L: true, M: true },
    targets,
    p1Checks,
    modern: buildModernReport(manifests, payments),
    p1ModernAudit: buildP1ModernAudit(manifests, payments),
    aggregates: byAgency,
    conservation: Object.fromEntries((["FIH", "LSHI", "KLZ"] as const).map((agency) => {
      const item = byAgency[agency] as { certifiedExpectedUsd: number | null; certifiedPaidUsd: number | null; certifiedRemainingUsd: number | null };
      return [agency, item.certifiedExpectedUsd !== null && item.certifiedPaidUsd !== null && item.certifiedRemainingUsd !== null && item.certifiedExpectedUsd === round(item.certifiedPaidUsd + item.certifiedRemainingUsd) ? "PASS" : "NON CALCULABLE"];
    })) as Record<Agency, string>
  };
}

function buildP1ModernAudit(manifests: readonly ManifestShipperRow[], payments: readonly ReturnType<typeof normalizePayment>[]) {
  const modernRows = manifests.map((row) => ({ row, code: exactCode(row.codeColisRaw), year: Number(parseDate(row.dateRaw)?.slice(0, 4) ?? NaN) }))
    .filter(({ code, year }) => Number.isFinite(year) && year >= 2026 && /^(AT|SE|OT|NV|DC)/.test(code));
  const identity = new Map<string, { valid: boolean; reason: string | null }>();
  modernRows.forEach(({ row, code, year }) => {
    const key = `${row.sourceSite}:${code}`;
    const cohort = resolveCohort(code, year);
    const expected = parseFirstAmount(row.historicalCurrentPriceFieldRaw, row.montantAttenduRaw);
    const current = identity.get(key);
    identity.set(key, current ? { valid: false, reason: "MANIFEST_MATCH_MULTIPLE" } : {
      valid: Boolean(cohort && cohort.state === "RESOLVED" && expected !== null && expected > 0),
      reason: cohort?.state !== "RESOLVED" ? "MANIFEST_COHORT_MISMATCH" : expected === null || expected <= 0 ? "OTHER_IDENTITY_FAILURE" : null
    });
  });
  return Object.fromEntries((['FIH', 'LSHI', 'KLZ'] as const).map((agency) => {
    const rows = payments.filter((payment) => payment.destination === agency && /^(AT|SE|OT|NV|DC)/.test(payment.code));
    const settled = rows.filter((payment) => !/PENDING|ATTENTE|FAILED|ECHEC|ANNUL/i.test(payment.status));
    const seen = new Set<string>();
    const certified = settled.filter((payment) => {
      const item = identity.get(`${agency}:${payment.code}`);
      const requestKey = payment.paymentRequestId ?? payment.id;
      if (!item?.valid || seen.has(requestKey)) return false;
      seen.add(requestKey);
      return true;
    });
    const excluded = rows.filter((payment) => !certified.includes(payment));
    const manifestByKey = new Map<string, ManifestShipperRow[]>();
    manifests.forEach((manifest) => {
      const code = exactCode(manifest.codeColisRaw);
      const year = Number(parseDate(manifest.dateRaw)?.slice(0, 4) ?? NaN);
      if (!Number.isFinite(year) || year < 2026 || !/^(AT|SE|OT|NV|DC)/.test(code)) return;
      const key = `${manifest.sourceSite}:${code}`;
      manifestByKey.set(key, [...(manifestByKey.get(key) ?? []), manifest]);
    });
    const diagnosticRows = rows.map((payment) => {
      const key = `${agency}:${payment.code}`;
      const matches = manifestByKey.get(key) ?? [];
      const manifest = matches[0] ?? null;
      const manifestYear = manifest ? Number(parseDate(manifest.dateRaw)?.slice(0, 4) ?? NaN) : NaN;
      const cohort = Number.isFinite(manifestYear) ? resolveCohort(payment.code, manifestYear) : null;
      const identityItem = identity.get(key);
      const crossSiteMatch = !matches.length && manifests.some((candidate) => exactCode(candidate.codeColisRaw) === payment.code);
      const isCertified = certified.includes(payment);
      const firstFail = !payment.code ? "CODE_EXACT_PRESERVE" : !payment.destination ? "DESTINATION_RESOLVED" : !cohort || cohort.state !== "RESOLVED" ? "COHORTE_RESOLVED" : !matches.length ? (crossSiteMatch ? "MANIFEST_DESTINATION_MISMATCH" : "MANIFEST_CODE_NOT_FOUND") : identityItem?.reason ? "MANIFEST_IDENTITY" : !isCertified ? "CERTIFICATION" : null;
      const pipeline = {
        P1_LU: "PASS",
        CODE_EXACT_PRESERVE: payment.code ? "PASS" : "FAIL",
        DESTINATION_RESOLVED: payment.destination ? "PASS" : "FAIL",
        COHORTE_RESOLVED: cohort?.state === "RESOLVED" ? "PASS" : "FAIL",
        SHEET_MANIFEST_RESOLVED: matches.length ? "PASS" : "FAIL",
        MANIFEST_SEARCH: matches.length ? "PASS" : "FAIL",
        MANIFEST_IDENTITY: identityItem?.valid ? "PASS" : "FAIL",
        PHYSICAL_DISAMBIGUATION: "NOT_REQUIRED",
        CERTIFICATION: isCertified ? "PASS" : "FAIL"
      } as const;
      return {
        code: payment.code,
        date: payment.dateKey,
        weightKg: manifest ? parseAmount(manifest.poidsRaw) : null,
        expectedUsd: payment.expectedAmount,
        paidUsd: payment.amount,
        remainingUsd: payment.remainingAmount,
        status: payment.status,
        paymentAgency: payment.agency,
        destination: payment.destination,
        cohort: cohort?.state === "RESOLVED" ? cohort.definition.id : null,
        manifestSheet: manifest?.sourceSite ?? agency,
        manifestCode: manifest ? exactCode(manifest.codeColisRaw) : null,
        manifestMatches: matches.length,
        manifestDate: manifest ? parseDate(manifest.dateRaw) : null,
        result: isCertified ? "CERTIFIED" : "NON_RECONCILED",
        reason: identityItem?.reason ?? (isCertified ? null : crossSiteMatch ? "MANIFEST_DESTINATION_MISMATCH" : "MANIFEST_CODE_NOT_FOUND"),
        firstFail,
        pipeline
      };
    });
    const statusCounts = rows.reduce((acc, payment) => { const status = /SOLD|PAYE|PAID|REGLE|COMPLET/i.test(payment.status) ? "SOLDÉ" : /PARTIEL/i.test(payment.status) ? "PARTIEL" : "AUTRE"; acc[status] = (acc[status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    const reasons = excluded.reduce((acc, payment) => { const item = identity.get(`${agency}:${payment.code}`); const reason = item?.reason ?? (!item ? "IDENTITE_PAIEMENT_NON_RETROUVEE" : "PAIEMENT_DUPLIQUE_OU_STATUT_NON_CERTIFIABLE"); const bucket = acc[reason] ??= { count: 0, amount: 0, examples: [] as string[] }; bucket.count += 1; bucket.amount = round(bucket.amount + payment.amount); if (bucket.examples.length < 5) bucket.examples.push(`${payment.code} (${payment.amount} USD)`); return acc; }, {} as Record<string, { count: number; amount: number; examples: string[] }>);
    const grossPaidUsd = round(rows.reduce((sum, row) => sum + row.amount, 0));
    const certifiedPaidUsd = round(certified.reduce((sum, row) => sum + row.amount, 0));
    const excludedAmountUsd = round(excluded.reduce((sum, row) => sum + row.amount, 0));
    return [agency, { rowCount: rows.length, grossExpectedUsd: round(rows.reduce((sum, row) => sum + (row.expectedAmount ?? 0), 0)), grossPaidUsd, grossRemainingUsd: round(rows.reduce((sum, row) => sum + (row.remainingAmount ?? 0), 0)), settledCount: statusCounts["SOLDÉ"] ?? 0, partialCount: statusCounts["PARTIEL"] ?? 0, otherStatusCount: statusCounts["AUTRE"] ?? 0, certifiedRowCount: certified.length, certifiedPaidUsd, nonReconciledCount: excluded.length, nonReconciledAmountUsd: excludedAmountUsd, excludedCount: excluded.length, excludedAmountUsd, ambiguousCount: excluded.filter((payment) => (identity.get(`${agency}:${payment.code}`)?.reason ?? "").includes("AMBIGU")).length, ambiguousAmountUsd: round(excluded.filter((payment) => (identity.get(`${agency}:${payment.code}`)?.reason ?? "").includes("AMBIGU")).reduce((sum, row) => sum + row.amount, 0)), exclusionReasons: reasons, diagnosticRows, lineConservation: rows.length === certified.length + excluded.length ? "PASS" : "FAIL", amountConservation: grossPaidUsd === round(certifiedPaidUsd + excludedAmountUsd) ? "PASS" : "FAIL" }];
  }));
}

function buildModernReport(manifests: readonly ManifestShipperRow[], payments: readonly ReturnType<typeof normalizePayment>[]) {
  const modern = manifests.map((row) => ({ row, code: exactCode(row.codeColisRaw), year: Number(parseDate(row.dateRaw)?.slice(0, 4) ?? NaN) }))
    .filter(({ code, year }) => Number.isFinite(year) && year >= 2026 && /^AT|^SE|^OT|^NV|^DC/.test(code));
  const unique = new Map<string, typeof modern>();
  modern.forEach((item) => { const key = `${item.row.sourceSite}:${item.code}`; unique.set(key, [...(unique.get(key) ?? []), item]); });
  const byAgency = Object.fromEntries((['FIH', 'LSHI', 'KLZ'] as const).map((agency) => {
    const candidates = Array.from(unique.values()).filter((items) => items[0]?.row.sourceSite === agency);
    let expected = 0; let paid = 0; let remaining = 0; let paidCount = 0; let remainingCount = 0; let nonCertified = 0; let insufficient = 0;
    const debts: Array<Record<string, unknown>> = [];
    candidates.forEach((items) => {
      const item = items[0];
      const code = item.code;
      const cohort = resolveCohort(code, item.year);
      const amountExpected = parseFirstAmount(item.row.historicalCurrentPriceFieldRaw, item.row.montantAttenduRaw);
      if (items.length !== 1 || !cohort || cohort.state !== 'RESOLVED' || amountExpected === null || amountExpected <= 0) { insufficient += 1; return; }
      const matching = payments.filter((payment) => payment.code === code && payment.destination === agency && !/PENDING|ATTENTE|FAILED|ECHEC|ANNUL/i.test(payment.status));
      const seen = new Set<string>();
      const amountPaid = matching.reduce((sum, payment) => { const key = payment.paymentRequestId ?? payment.id; if (seen.has(key)) return sum; seen.add(key); return sum + payment.amount; }, 0);
      const paidAmount = round(Math.min(amountExpected, amountPaid));
      const restAmount = round(Math.max(0, amountExpected - amountPaid));
      expected += amountExpected; paid += paidAmount; remaining += restAmount;
      if (restAmount > 0) { remainingCount += 1; debts.push({ code, agency, cohort: cohort.definition.id, year: item.year, weightKg: parseAmount(item.row.poidsRaw), expectedUsd: amountExpected, paidUsd: paidAmount, remainingUsd: restAmount, beneficiary: item.row.beneficiaireRaw || null, physicalIdentity: null, provenance: 'MANIFEST_COO_PLUS_P1' }); }
      else paidCount += 1;
    });
    return [agency, { certifiedExpectedUsd: round(expected), certifiedPaidUsd: round(paid), certifiedRemainingUsd: round(remaining), paidIdentityCount: paidCount, remainingIdentityCount: remainingCount, nonCertifiedCount: nonCertified, insufficientDataCount: insufficient, debts, conservation: round(expected) === round(paid + remaining) ? 'PASS' : 'FAIL' }];
  })) as Record<Agency, unknown>;
  return byAgency;
}

function certifyHistoricalRow(row: ManifestShipperRow) {
  const code = exactCode(row.codeColisRaw);
  const year = parseDate(row.dateRaw)?.slice(0, 4) ?? null;
  const prefix = code.match(/^[A-Z]+/)?.[0] ?? "";
  const cohort = year ? resolveCohort(code, Number(year)) : null;
  const expected = parseFirstAmount(row.historicalCurrentPriceFieldRaw, row.montantAttenduRaw);
  const paid = parseAmount(row.historicalPaidAmountRaw);
  const remainingHistorical = parseAmount(row.historicalRemainingAmountRaw);
  const status = String(row.historicalPaymentStatusRaw ?? "").trim();
  const reasons: string[] = [];
  let state: CertificationState = "DONNEES_INSUFFISANTES";
  let remainingUsd: number | null = null;

  if (!HISTORICAL_PREFIXES.has(prefix)) reasons.push("SOURCE_HISTORIQUE_NON_APPLICABLE");
  if (!cohort || cohort.state !== "RESOLVED") reasons.push("COHORTE_NON_RESOLUE");
  if (expected === null) reasons.push("MONTANT_ATTENDU_INCONNU");
  if (paid === null && remainingHistorical === null && !status) reasons.push("G_L_M_ABSENTS");
  if (remainingHistorical !== null && remainingHistorical < 0) reasons.push("L_NEGATIF_NON_INTERPRETE_COMME_DETTE");
  if (expected !== null && expected <= 0) reasons.push("F_ZERO_OU_INVALIDE");

  const settled = /PAYE|PAIE|SOLD|REGLE|COMPLET|PAID/i.test(status) && !/ATTENTE|PENDING|ECHEC|FAILED|ANNUL/i.test(status);
  if (HISTORICAL_PREFIXES.has(prefix) && cohort?.state === "RESOLVED" && expected !== null && expected > 0 && paid !== null && paid > 0 && settled && (remainingHistorical === null || remainingHistorical <= 0) && paid >= expected) {
    state = "PAYE_CERTIFIE";
  } else if (HISTORICAL_PREFIXES.has(prefix) && cohort?.state === "RESOLVED" && expected !== null && expected > 0 && paid !== null && paid > 0 && settled && remainingHistorical !== null && remainingHistorical > 0 && paid < expected) {
    state = "RESTE_A_ENCAISSER_CERTIFIE";
    remainingUsd = round(expected - paid);
  } else if (HISTORICAL_PREFIXES.has(prefix) && (paid !== null || remainingHistorical !== null || status)) {
    state = "PAIEMENT_HISTORIQUE_NON_CERTIFIE";
  }

  return {
    sheet: row.sourceSite as Agency,
    code,
    date: parseDate(row.dateRaw),
    weightKg: parseAmount(row.poidsRaw),
    expectedUsd: expected,
    paidUsd: paid,
    remainingUsd,
    status,
    cohort: cohort?.state === "RESOLVED" ? cohort.definition.id : null,
    state,
    reasons
  };
}

function sanitizeEvidence(row: ReturnType<typeof certifyHistoricalRow>) {
  return { sheet: row.sheet, code: row.code, date: row.date, weightKg: row.weightKg, expectedUsd: row.expectedUsd, paidUsd: row.paidUsd, remainingUsd: row.remainingUsd, status: row.status, cohort: row.cohort, state: row.state, reasons: row.reasons };
}

function normalizePayment(payment: { id: string; dateKey: string; codeColis: string; destinationCode: string; agenceEncaissement: string; montantPaye: number; montantAttendu?: number | null; soldeRestant?: number | null; statutPaiement?: string; paymentRequestId?: string }) {
  return { id: payment.id, dateKey: payment.dateKey, code: exactCode(payment.codeColis), destination: String(payment.destinationCode).toUpperCase(), agency: String(payment.agenceEncaissement).toUpperCase(), amount: payment.montantPaye, expectedAmount: payment.montantAttendu ?? null, remainingAmount: payment.soldeRestant ?? null, status: payment.statutPaiement ?? "", paymentRequestId: payment.paymentRequestId || null };
}

function paymentSum(payments: readonly ReturnType<typeof normalizePayment>[], code: string, expectedByAgency: Partial<Record<Agency | "COO", number>>) {
  const rows = payments.filter((payment) => payment.code === code);
  const expectedAgencies = new Set(Object.keys(expectedByAgency));
  const matchedRows = rows.filter((payment) => expectedAgencies.has(payment.agency));
  const unexpectedRows = rows.filter((payment) => !expectedAgencies.has(payment.agency));
  const uniqueIds = new Set(matchedRows.map((payment) => payment.id));
  const byAgency: Record<string, number> = {};
  matchedRows.forEach((payment) => { byAgency[payment.agency] ??= 0; });
  matchedRows.forEach((payment) => { byAgency[payment.agency] = round((byAgency[payment.agency] ?? 0) + payment.amount); });
  const expected = round(Object.values(expectedByAgency).reduce((sum, amount) => sum + (amount ?? 0), 0));
  const total = round(matchedRows.reduce((sum, row) => sum + row.amount, 0));
  const agencyPass = Object.entries(expectedByAgency).every(([agency, amount]) => byAgency[agency] === amount);
  return { totalPaidUsd: total, expectedUsd: expected, byAgency, rowCount: matchedRows.length, uniquePaymentCount: uniqueIds.size, duplicatePaymentIds: matchedRows.length - uniqueIds.size, unexpectedRows: unexpectedRows.map((row) => ({ id: row.id, date: row.dateKey, agency: row.agency, destination: row.destination, amount: row.amount, paymentRequestId: row.paymentRequestId })), rows: matchedRows.map((row) => ({ id: row.id, date: row.dateKey, agency: row.agency, destination: row.destination, amount: row.amount, paymentRequestId: row.paymentRequestId })), pass: total === expected && agencyPass && matchedRows.length === uniqueIds.size };
}

function exactCode(value: unknown) { return String(value ?? "").trim().toUpperCase(); }
function parseAmount(value: unknown): number | null { const text = String(value ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, ""); const number = Number(text); return text && Number.isFinite(number) ? number : null; }
function parseFirstAmount(...values: unknown[]) { for (const value of values) { const parsed = parseAmount(value); if (parsed !== null) return parsed; } return null; }
function parseDate(value: unknown): string | null { const raw = String(value ?? "").trim(); const french = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/); if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`; return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function jsonError(message: string, status: number) { return NextResponse.json({ message }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
