import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { ManifestShipperRow } from "@/features/admin/types";
import { resolveCohort, withBilanCohorts } from "@/features/admin/bilan/cohort-registry";
import { readBilanOriginMonths } from "@/server/bilan-origin-months";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readCanonicalPaymentManifestRows } from "@/server/admin-manifest-sheets";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { readExhaustivePages } from "@/server/exhaustive-pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HISTORICAL_PREFIXES = new Set(["MR", "AV", "MA", "JN", "JL"]);
const MODERN_START_DATE = "2026-08-01";
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
      readCanonicalPaymentManifestRows(),
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

    const requestedCohortId = new URL(request.url).searchParams.get("cohortId")?.trim() || null;
    if (requestedCohortId && !definitions.some((item) => item.id === requestedCohortId)) return jsonError("Cohorte non résolue.", 400);

    const initial = withBilanCohorts(definitions, () => buildReport(manifests, payments, [], requestedCohortId));
    const modernCodes = manifests.filter(isModernManifestRow).map((row) => exactCode(row.codeColisRaw));
    const physical = await readPhysicalIdentities(Array.from(new Set(["AT02326", "AT09826", ...modernCodes])));
    const result = withBilanCohorts(definitions, () => buildReport(manifests, payments, physical.matches, requestedCohortId));
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
  createdAt: string | null;
  currentlyPresent: boolean;
  everPresent: boolean;
  arrivalDate: string | null;
  historicallyReceived: boolean;
  physicalEvidence: string[];
};

async function readPhysicalIdentities(codes: readonly string[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return { state: "UNAVAILABLE" as const, matches: [] as PhysicalIdentity[] };
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
  const chunks = Array.from({ length: Math.ceil(codes.length / 500) }, (_, index) => codes.slice(index * 500, (index + 1) * 500));
  const physicalResults = await Promise.all([
    Promise.all(chunks.map((chunk) => readExhaustivePages(async (from, to) => {
      const result = await client.from("stockage_parcels").select("parcel_id,forwarding_id,tracking_code,agency,canonical_weight_kg,delivery_status,created_at,stockage_forwardings(origin_agency,destination_agency)").in("tracking_code", chunk).order("parcel_id", { ascending: true }).range(from, to);
      if (result.error) throw result.error;
      return result.data ?? [];
    }, { identity: (row) => String(row.parcel_id) }))),
    Promise.all(chunks.map((chunk) => readExhaustivePages(async (from, to) => {
      const result = await client.from("stockage_forwardings").select("forwarding_id,original_tracking_code,origin_agency,destination_agency").in("original_tracking_code", chunk).order("forwarding_id", { ascending: true }).range(from, to);
      if (result.error) throw result.error;
      return result.data ?? [];
    }, { identity: (row) => String(row.forwarding_id) }))),
    Promise.all(chunks.map((chunk) => readExhaustivePages(async (from, to) => {
      const result = await client.from("stockage_payment_orchestrations").select("request_id,tracking_code,agency,state,parcel_id,forwarding_id").in("tracking_code", chunk).order("request_id", { ascending: true }).range(from, to);
      if (result.error) throw result.error;
      return result.data ?? [];
    }, { identity: (row) => String(row.request_id) }))),
    Promise.all(chunks.map((chunk) => readExhaustivePages(async (from, to) => {
      const result = await client.from("stockage_events").select("event_id,event_type,agency,occurred_at,business_date,tracking_code,arrival_reference,metadata").in("tracking_code", chunk).order("event_id", { ascending: true }).range(from, to);
      if (result.error) throw result.error;
      return result.data ?? [];
    }, { identity: (row) => String(row.event_id) })))
  ]).catch(() => null);
  if (!physicalResults) return { state: "UNAVAILABLE" as const, matches: [] as PhysicalIdentity[] };
  const [parcelPages, forwardingPages, orchestrationPages, eventPages] = physicalResults;
  const parcels = parcelPages.flatMap((page) => page.rows) as Array<Record<string, unknown>>;
  const forwardings = forwardingPages.flatMap((page) => page.rows) as Array<Record<string, unknown>>;
  const orchestrations = orchestrationPages.flatMap((page) => page.rows) as Array<Record<string, unknown>>;
  const events = eventPages.flatMap((page) => page.rows) as Array<Record<string, unknown>>;
  const forwardingById = new Map(forwardings.map((row) => [String(row.forwarding_id), row]));
  const orchestrationRows = (orchestrations ?? []) as Array<Record<string, unknown>>;
  const eventRows = events;
  const matches = (parcels ?? []).map((row) => {
    const forwarding = row.forwarding_id ? forwardingById.get(String(row.forwarding_id)) : null;
    const orchestration = orchestrationRows.find((candidate) => String(candidate.agency ?? "") === String(row.agency ?? "") && String(candidate.tracking_code ?? "") === String(row.tracking_code ?? "") && (!row.forwarding_id || String(candidate.forwarding_id ?? "") === String(row.forwarding_id)));
    const rowEvents = eventRows.filter((event) => String(event.agency ?? "").toUpperCase() === String(row.agency ?? "").toUpperCase() && exactCode(event.tracking_code) === exactCode(row.tracking_code));
    return {
      agency: String(row.agency ?? ""), trackingCode: String(row.tracking_code ?? ""), parcelId: row.parcel_id ? String(row.parcel_id) : null,
      forwardingId: row.forwarding_id ? String(row.forwarding_id) : null,
      originAgency: forwarding?.origin_agency ? String(forwarding.origin_agency) : null,
      destinationAgency: forwarding?.destination_agency ? String(forwarding.destination_agency) : null,
      weightKg: Number.isFinite(Number(row.canonical_weight_kg)) ? Number(row.canonical_weight_kg) : null,
      deliveryStatus: row.delivery_status ? String(row.delivery_status) : null,
      paymentRequestId: orchestration?.request_id ? String(orchestration.request_id) : null,
      orchestrationState: orchestration?.state ? String(orchestration.state) : null,
      createdAt: row.created_at ? String(row.created_at) : null,
      currentlyPresent: ["AVAILABLE", "PRESENT"].includes(String(row.delivery_status ?? "").toUpperCase()),
      everPresent: true,
      arrivalDate: rowEvents.map((event) => String(event.occurred_at ?? event.business_date ?? "")).filter(Boolean).sort()[0] ?? (row.created_at ? String(row.created_at) : null),
      historicallyReceived: true,
      physicalEvidence: ["PARCEL_V2", ...rowEvents.map((event) => String(event.event_type ?? "STORAGE_EVENT"))]
    } satisfies PhysicalIdentity;
  });
  const historicalOnly = eventRows.filter((event) => {
    const agency = String(event.agency ?? "").toUpperCase();
    const code = exactCode(event.tracking_code);
    return agency && code && !matches.some((match) => match.agency.toUpperCase() === agency && match.trackingCode === code);
  }).map((event) => ({
    agency: String(event.agency ?? ""), trackingCode: exactCode(event.tracking_code), parcelId: null, forwardingId: null,
    originAgency: null, destinationAgency: String(event.agency ?? ""), weightKg: null,
    deliveryStatus: String(event.event_type ?? ""), paymentRequestId: null, orchestrationState: null, createdAt: null,
    currentlyPresent: false, everPresent: true,
    arrivalDate: String(event.occurred_at ?? event.business_date ?? "") || null,
    historicallyReceived: true, physicalEvidence: [String(event.event_type ?? "STORAGE_EVENT")]
  } satisfies PhysicalIdentity));
  return { state: "FOUND" as const, matches: [...matches, ...historicalOnly] };
}

function buildReport(manifests: readonly ManifestShipperRow[], payments: readonly ReturnType<typeof normalizePayment>[], physicalMatches: readonly PhysicalIdentity[] = [], cohortId: string | null = null) {
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
    modernManifestAudit: buildModernManifestAudit(manifests, payments, physicalMatches, cohortId),
    fZeroAudit: buildFZeroAudit(manifests, payments),
    aggregates: byAgency,
    conservation: Object.fromEntries((["FIH", "LSHI", "KLZ"] as const).map((agency) => {
      const item = byAgency[agency] as { certifiedExpectedUsd: number | null; certifiedPaidUsd: number | null; certifiedRemainingUsd: number | null };
      return [agency, item.certifiedExpectedUsd !== null && item.certifiedPaidUsd !== null && item.certifiedRemainingUsd !== null && item.certifiedExpectedUsd === round(item.certifiedPaidUsd + item.certifiedRemainingUsd) ? "PASS" : "NON CALCULABLE"];
    })) as Record<Agency, string>
  };
}

type FZeroClassification = "F_ZERO_P1_SOLDE_CERTIFIE" | "F_ZERO_P1_PARTIEL_CERTIFIE" | "F_ZERO_P1_TROUVE_IDENTITE_AMBIGUE" | "F_ZERO_P1_ABSENT" | "F_ZERO_P1_DUPLICATION_A_CONTROLER" | "F_ZERO_FORWARDING_A_DESAMBIGUISER";

function isSettledPayment(payment: ReturnType<typeof normalizePayment>) {
  return !/PENDING|ATTENTE|FAILED|ECHEC|ANNUL|PARTIEL/i.test(payment.status) && /SOLD|PAYE|PAID|REGLE|COMPLET/i.test(payment.status);
}

function buildFZeroAudit(manifests: readonly ManifestShipperRow[], payments: readonly ReturnType<typeof normalizePayment>[]) {
  const candidates = manifests.map((row) => ({ row, code: exactCode(row.codeColisRaw), year: Number(parseDate(row.dateRaw)?.slice(0, 4) ?? NaN) }))
    .filter(({ row }) => isModernManifestRow(row));
  const byCode = new Map<string, typeof candidates>();
  candidates.forEach((item) => byCode.set(`${item.row.sourceSite}:${item.code}`, [...(byCode.get(`${item.row.sourceSite}:${item.code}`) ?? []), item]));
  const paymentIndex = new Map<string, ReturnType<typeof normalizePayment>[]>();
  payments.forEach((payment) => paymentIndex.set(payment.code, [...(paymentIndex.get(payment.code) ?? []), payment]));
  return Object.fromEntries((['FIH', 'LSHI', 'KLZ'] as const).map((agency) => {
    const identities = Array.from(byCode.entries()).filter(([key, items]) => key.startsWith(`${agency}:`) && classifyManifestF(items[0].row.historicalCurrentPriceFieldRaw ?? items[0].row.montantAttenduRaw) === "F_ZERO");
    const rows = identities.map(([key, items]) => {
      const item = items[0];
      const code = key.slice(agency.length + 1);
      const cohort = resolveCohort(code, item.year);
      const financial = classifyFinancialState({
        F: parseAmount(item.row.historicalCurrentPriceFieldRaw ?? item.row.montantAttenduRaw),
        L: parseAmount(item.row.historicalRemainingAmountRaw),
        M: parseAmount(item.row.historicalPaidAmountRaw)
      });
      const allPayments = (paymentIndex.get(code) ?? []).filter((payment) => payment.destination === agency);
      const seen = new Set<string>();
      const duplicateIds = new Set<string>();
      const transactions = allPayments.filter((payment) => {
        const id = payment.paymentRequestId ?? payment.id;
        if (seen.has(id)) { duplicateIds.add(id); return false; }
        seen.add(id); return true;
      });
      const totalPaidUsd = round(transactions.reduce((sum, payment) => sum + payment.amount, 0));
      const chronological = [...transactions].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
      const finalPayment = chronological.at(-1) ?? null;
      const identityValid = items.length === 1 && cohort?.state === "RESOLVED";
      let classification: FZeroClassification = "F_ZERO_P1_ABSENT";
      if (duplicateIds.size) classification = "F_ZERO_P1_DUPLICATION_A_CONTROLER";
      else if (!transactions.length) classification = "F_ZERO_P1_ABSENT";
      else if (!identityValid) classification = "F_ZERO_P1_TROUVE_IDENTITE_AMBIGUE";
      else if (financial.state === "SOLDÉ") classification = "F_ZERO_P1_SOLDE_CERTIFIE";
      else if (financial.state === "PARTIEL") classification = "F_ZERO_P1_PARTIEL_CERTIFIE";
      else classification = "F_ZERO_P1_TROUVE_IDENTITE_AMBIGUE";
      return { code, destination: agency, cohort: cohort?.state === "RESOLVED" ? cohort.definition.id : null, weightKg: parseAmount(item.row.poidsRaw), manifestF: item.row.historicalCurrentPriceFieldRaw ?? item.row.montantAttenduRaw ?? null, manifestG: item.row.historicalPaymentStatusRaw ?? null, manifestL: item.row.historicalRemainingAmountRaw ?? null, manifestM: item.row.historicalPaidAmountRaw ?? null, financialState: financial.state, commercialPrice: financial.commercialPrice, paid: financial.paid, remaining: financial.remaining, transactions: transactions.map((payment) => ({ amountUsd: payment.amount, status: payment.status, date: payment.dateKey, agency: payment.agency, destination: payment.destination, paymentRequestId: payment.paymentRequestId })), totalPaidUsd, classification, duplicateIds: Array.from(duplicateIds) };
    });
    const count = (classification: FZeroClassification) => rows.filter((row) => row.classification === classification).length;
    return [agency, { total: rows.length, withP1: rows.filter((row) => row.transactions.length).length, settled: count("F_ZERO_P1_SOLDE_CERTIFIE"), partial: count("F_ZERO_P1_PARTIEL_CERTIFIE"), ambiguous: count("F_ZERO_P1_TROUVE_IDENTITE_AMBIGUE"), absent: count("F_ZERO_P1_ABSENT"), duplicates: count("F_ZERO_P1_DUPLICATION_A_CONTROLER"), forwarding: count("F_ZERO_FORWARDING_A_DESAMBIGUISER"), rows }];
  }));
}

function buildP1ModernAudit(manifests: readonly ManifestShipperRow[], payments: readonly ReturnType<typeof normalizePayment>[]) {
  const modernRows = manifests.map((row) => ({ row, code: exactCode(row.codeColisRaw), year: Number(parseDate(row.dateRaw)?.slice(0, 4) ?? NaN) }))
    .filter(({ row }) => isModernManifestRow(row));
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
    const rows = payments.filter((payment) => payment.destination === agency && identity.has(`${agency}:${payment.code}`));
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
      if (!isModernManifestRow(manifest)) return;
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
        manifestF: manifest ? manifest.historicalCurrentPriceFieldRaw ?? manifest.montantAttenduRaw ?? null : null,
        manifestFType: manifest ? rawValueType(manifest.historicalCurrentPriceFieldRaw ?? manifest.montantAttenduRaw) : null,
        manifestFState: manifest ? classifyManifestF(manifest.historicalCurrentPriceFieldRaw ?? manifest.montantAttenduRaw) : null,
        manifestM: manifest ? manifest.historicalPaidAmountRaw ?? null : null,
        manifestMType: manifest ? rawValueType(manifest.historicalPaidAmountRaw) : null,
        manifestMPresent: manifest ? hasRawValue(manifest.historicalPaidAmountRaw) : false,
        manifestG: manifest ? manifest.historicalPaymentStatusRaw ?? null : null,
        manifestL: manifest ? manifest.historicalRemainingAmountRaw ?? null : null,
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
    .filter(({ row }) => isModernManifestRow(row));
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

type ModernFinancialState = "SOLDÉ" | "PARTIEL" | "NON PAYÉ" | "FUTURE DETTE" | "À VÉRIFIER";

function isModernManifestRow(row: ManifestShipperRow) {
  const date = parseDate(row.dateRaw);
  return Boolean(date && date >= MODERN_START_DATE && exactCode(row.codeColisRaw));
}

function buildModernManifestAudit(manifests: readonly ManifestShipperRow[], payments: readonly ReturnType<typeof normalizePayment>[], physicalMatches: readonly PhysicalIdentity[] = [], selectedCohortId: string | null = null) {
  const modernRows = manifests.filter(isModernManifestRow).filter((row) => {
    if (!selectedCohortId) return true;
    const code = exactCode(row.codeColisRaw);
    const date = parseDate(row.dateRaw);
    const year = date ? Number(date.slice(0, 4)) : NaN;
    const cohort = Number.isFinite(year) ? resolveCohort(code, year) : null;
    return cohort?.state === "RESOLVED" && cohort.definition.id === selectedCohortId;
  });
  const byIdentity = new Map<string, ManifestShipperRow[]>();
  modernRows.forEach((row) => {
    const code = exactCode(row.codeColisRaw);
    const date = parseDate(row.dateRaw);
    const year = date ? Number(date.slice(0, 4)) : NaN;
    const cohort = Number.isFinite(year) ? resolveCohort(code, year) : null;
    const cohortKey = cohort?.state === "RESOLVED" ? cohort.definition.id : `YEAR:${year}`;
    const key = `${row.sourceSite}:${cohortKey}:${code}`;
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), row]);
  });

  const allByCode = new Map<string, ReturnType<typeof normalizePayment>[]>();
  payments.forEach((payment) => allByCode.set(payment.code, [...(allByCode.get(payment.code) ?? []), payment]));
  const physicalByCode = new Map<string, PhysicalIdentity[]>();
  physicalMatches.forEach((match) => {
    const key = `${match.agency}:${match.trackingCode}`;
    physicalByCode.set(key, [...(physicalByCode.get(key) ?? []), match]);
  });

  const rows = Array.from(byIdentity.entries()).map(([key, matches]) => {
    const row = matches[0];
    const code = exactCode(row.codeColisRaw);
    const date = parseDate(row.dateRaw);
    const year = date ? Number(date.slice(0, 4)) : NaN;
    const cohort = Number.isFinite(year) ? resolveCohort(code, year) : null;
    const fState = classifyManifestF(row.historicalCurrentPriceFieldRaw ?? row.montantAttenduRaw);
    const lUsd = parseAmount(row.historicalRemainingAmountRaw);
    const mUsd = parseAmount(row.historicalPaidAmountRaw);
    const fUsd = fState === "F_POSITIF" ? parseAmount(row.historicalCurrentPriceFieldRaw ?? row.montantAttenduRaw) : null;
    const financial = classifyFinancialState({ F: fUsd, L: lUsd, M: mUsd });
    const remainingUsd = financial.remaining;
    const transactions = deduplicatePayments((allByCode.get(code) ?? []).filter((payment) => payment.destination === row.sourceSite));
    const totalPaidUsd = round(transactions.reduce((sum, payment) => sum + payment.amount, 0));
    // F/L/M in the Manifest are the canonical financial evidence. P1 is
    // retained as supporting evidence only and never overrides M or L.
    const paidEvidenceUsd = financial.paid;
    const commercialUsd = financial.commercialPrice;
    const chronological = [...transactions].sort((a, b) => `${a.dateKey}:${a.id}`.localeCompare(`${b.dateKey}:${b.id}`));
    const finalPayment = chronological.at(-1) ?? null;
    const settled = financial.state === "SOLDÉ";
    const partial = financial.state === "PARTIEL";
    const physical = physicalByCode.get(`${row.sourceSite}:${code}`) ?? [];
    const currentlyPresent = physical.some((match) => match.currentlyPresent);
    const historicallyReceived = physical.some((match) => match.historicallyReceived || match.everPresent);
    const paymentCohortAmbiguous = Array.from(byIdentity.keys()).filter((identity) => identity.startsWith(`${row.sourceSite}:`) && identity.endsWith(`:${code}`)).length > 1 && transactions.length > 0;
    let state: ModernFinancialState = "À VÉRIFIER";
    let reason = "IDENTITE_OU_MONTANT_NON_CERTIFIABLE";
    if (matches.length !== 1) reason = "IDENTITE_MANIFESTE_DUPLIQUEE";
    else if (!cohort || cohort.state !== "RESOLVED") reason = "COHORTE_NON_RESOLUE";
    else if (paymentCohortAmbiguous) reason = "PAIEMENT_COHORTE_AMBIGU";
    else if (financial.state === "SOLDÉ") { state = "SOLDÉ"; reason = "L_ZERO_M_POSITIF"; }
    else if (financial.state === "PARTIEL" && historicallyReceived) { state = "PARTIEL"; reason = "DETTE_ACTUELLE_PARTIELLE"; }
    else if (financial.state === "NON PAYÉ" && historicallyReceived) { state = "NON PAYÉ"; reason = "DETTE_ACTUELLE_NON_PAYEE"; }
    else if ((financial.state === "PARTIEL" || financial.state === "NON PAYÉ") && !historicallyReceived) { state = "FUTURE DETTE"; reason = "JAMAIS_RECU_STOCKAGE_V2"; }
    else if (financial.state === "À VÉRIFIER") reason = "F_L_M_NON_RESOLUS";
    return {
      code, exactPrefix: code.match(/^[A-Z]+/)?.[0] ?? "", sourceSheet: row.sourceSite, date, year: Number.isFinite(year) ? year : null,
      cohort: cohort?.state === "RESOLVED" ? cohort.definition.id : null, weightKg: parseAmount(row.poidsRaw), sender: row.expediteurRaw || null, beneficiary: row.beneficiaireRaw || null,
      manifestF: row.historicalCurrentPriceFieldRaw ?? row.montantAttenduRaw ?? null, manifestFState: fState, manifestG: row.historicalPaymentStatusRaw ?? null,
      manifestL: row.historicalRemainingAmountRaw ?? null, manifestM: row.historicalPaidAmountRaw ?? null, financialState: financial.state, expectedUsd: commercialUsd, paidUsd: paidEvidenceUsd ?? 0, remainingUsd,
      state, reason, transactions: transactions.map((payment) => ({ amountUsd: payment.amount, status: payment.status, date: payment.dateKey, collectingAgency: payment.agency, destination: payment.destination, paymentRequestId: payment.paymentRequestId })),
      lastPaymentDate: finalPayment?.dateKey ?? null, lastCollectingAgency: finalPayment?.agency ?? null,
      identityKey: `${row.sourceSite}:${cohort?.state === "RESOLVED" ? cohort.definition.id : year}:${code}`,
      currentlyPresent,
      historicallyReceived,
      physicalMatches: physical
    };
  });

  const byAgency = Object.fromEntries((['FIH', 'LSHI', 'KLZ'] as const).map((agency) => {
    const agencyRows = rows.filter((row) => String(row.sourceSheet).trim().toUpperCase() === agency);
    // The row state is the sole financial classification. Normalize only its
    // serialized representation at the aggregation boundary; never re-read
    // F/L/M or derive a second financial state here.
    const canonicalState = (state: ModernFinancialState) => String(state).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const count = (state: ModernFinancialState) => agencyRows.filter((row) => canonicalState(row.state) === canonicalState(state)).length;
    const certifiable = agencyRows.filter((row) => row.state === "SOLDÉ" || row.state === "PARTIEL" || row.state === "NON PAYÉ" || row.state === "FUTURE DETTE");
    const settled = count("SOLDÉ");
    const partial = count("PARTIEL");
    const unpaidCurrent = count("NON PAYÉ");
    const futureDebts = count("FUTURE DETTE");
    const unpaid = unpaidCurrent + futureDebts;
    const toVerify = count("À VÉRIFIER");
    const currentDebts = partial + unpaidCurrent;
    return [agency, {
      total: agencyRows.length, settled, partial, unpaidCertified: unpaid, currentDebts, futureDebts, toVerify,
      certifiedPaidUsd: round(certifiable.reduce((sum, row) => sum + row.paidUsd, 0)),
      certifiedRemainingUsd: certifiable.every((row) => row.remainingUsd !== null) ? round(certifiable.reduce((sum, row) => sum + (row.remainingUsd ?? 0), 0)) : null,
      debts: agencyRows.filter((row) => row.state === "PARTIEL" || row.state === "NON PAYÉ"),
      futureDebtRows: agencyRows.filter((row) => row.state === "FUTURE DETTE"),
      conservation: {
        principal: agencyRows.length === settled + partial + unpaid + toVerify ? "PASS" : "FAIL",
        receivables: currentDebts + futureDebts === partial + unpaid ? "PASS" : "FAIL"
      }
    }];
  }));
  const cohorts = new Map<string, typeof rows>();
  rows.forEach((row) => { const key = row.cohort ?? `${row.exactPrefix}-${row.year ?? "UNKNOWN"}`; cohorts.set(key, [...(cohorts.get(key) ?? []), row]); });
  const cohortSummary = Object.fromEntries(Array.from(cohorts.entries()).map(([cohort, cohortRows]) => [cohort, {
    total: cohortRows.length, settled: cohortRows.filter((row) => row.state === "SOLDÉ").length, partial: cohortRows.filter((row) => row.state === "PARTIEL").length,
    unpaidCertified: cohortRows.filter((row) => row.state === "NON PAYÉ").length, toVerify: cohortRows.filter((row) => row.state === "À VÉRIFIER").length
  }]));
  return { startDate: MODERN_START_DATE, endDate: new Date().toISOString().slice(0, 10), activeCohortId: selectedCohortId, rows, byAgency, byCohort: cohortSummary, conservation: Object.fromEntries((['FIH', 'LSHI', 'KLZ'] as const).map((agency) => { const item = byAgency[agency] as { total: number; settled: number; partial: number; unpaidCertified: number; currentDebts: number; futureDebts: number; toVerify: number; conservation: { principal: string; receivables: string } }; return [agency, item.conservation.principal === "PASS" && item.conservation.receivables === "PASS" ? "PASS" : "FAIL"]; })) };
}

function deduplicatePayments(payments: readonly ReturnType<typeof normalizePayment>[]) {
  const seen = new Set<string>();
  return payments.filter((payment) => { const key = payment.paymentRequestId ?? payment.id; if (seen.has(key)) return false; seen.add(key); return true; });
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
function hasRawValue(value: unknown) { return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === ""); }
function rawValueType(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? "NUMBER" : "NON_NUMERIC";
  if (typeof value === "string") return "STRING";
  return typeof value;
}
function classifyManifestF(value: unknown) {
  if (value === null || value === undefined) return "F_NULL";
  if (typeof value === "string" && value.trim() === "") return "F_VIDE";
  const parsed = parseAmount(value);
  if (parsed !== null && parsed > 0) return "F_POSITIF";
  if (parsed === 0) return "F_ZERO";
  return "F_NON_NUMERIQUE";
}
type FinancialState = "SOLDÉ" | "PARTIEL" | "NON PAYÉ" | "À VÉRIFIER";
type FinancialClassification = { state: FinancialState; commercialPrice: number | null; paid: number | null; remaining: number | null };
function classifyFinancialState({ F, L, M }: { F: number | null; L: number | null; M: number | null }): FinancialClassification {
  // F is deliberately accepted for traceability, but L/M are the canonical
  // financial evidence. A numeric zero is valid and remains distinct from null.
  void F;
  if (L === null || M === null) return { state: "À VÉRIFIER", commercialPrice: null, paid: M, remaining: L };
  if (L === 0 && M > 0) return { state: "SOLDÉ", commercialPrice: round(L + M), paid: M, remaining: 0 };
  if (L > 0 && M === 0) return { state: "NON PAYÉ", commercialPrice: round(L), paid: 0, remaining: L };
  if (L > 0 && M > 0) return { state: "PARTIEL", commercialPrice: round(L + M), paid: M, remaining: L };
  return { state: "À VÉRIFIER", commercialPrice: null, paid: M, remaining: L };
}
function parseAmount(value: unknown): number | null { const text = String(value ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, ""); const number = Number(text); return text && Number.isFinite(number) ? number : null; }
function parseFirstAmount(...values: unknown[]) { for (const value of values) { const parsed = parseAmount(value); if (parsed !== null) return parsed; } return null; }
function parseDate(value: unknown): string | null { const raw = String(value ?? "").trim(); const french = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/); if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`; return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function jsonError(message: string, status: number) { return NextResponse.json({ message }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
