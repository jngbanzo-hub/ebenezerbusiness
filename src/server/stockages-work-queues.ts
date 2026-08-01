import "server-only";

import { parseStrictPositiveWeight } from "@/features/admin/shippers";
import type { AdminPayment, ManifestShipperRow } from "@/features/admin/types";
import { readCanonicalPaymentManifestRows } from "@/server/admin-manifest-sheets";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { buildEncaissementsFinancialProjection } from "@/server/encaissements-financial-projection";
import { requireStorageAgency, type StorageAgency } from "@/server/stockages-v2";

export const QUEUE_SECTIONS = ["TO_COLLECT", "PARTIAL", "READY", "VERIFICATION", "RECENT"] as const;
export type QueueSection = (typeof QUEUE_SECTIONS)[number];

export type QueueFilters = {
  section: QueueSection;
  query: string;
  paymentSite: "ALL" | "COO" | StorageAgency;
  paymentStatus: "ALL" | "UNPAID" | "PARTIAL" | "PAID" | "VERIFICATION";
  paymentAgent: string;
  deliveryAgent: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
};

export type WorkQueueItem = {
  trackingCode: string;
  beneficiary: string;
  destination: StorageAgency;
  weightKg: number | null;
  weightState: "VALID" | "MISSING" | "AMBIGUOUS";
  amountExpected: number | null;
  amountPaid: number | null;
  remainingBalance: number | null;
  paymentSites: string[];
  paymentAgents: string[];
  paymentLabel: string;
  deliveryStatus: "TO_COLLECT" | "PARTIAL_PAYMENT_REMAINING" | "READY" | "VERIFICATION_REQUIRED" | "DELIVERED";
  financialState: "COMPLETE" | "INCOMPLETE" | "CONFLICT";
  anomalies: string[];
  deliveredAt: string | null;
  businessDate: string | null;
  deliveredBy: string | null;
  deliveryReference: string | null;
  canConfirmDelivery: boolean;
};

export type WorkQueueExclusion = {
  trackingCode: string;
  reason: "EXCLUDED_HISTORICAL" | "EXCLUDED_WRONG_AGENCY" | "INVALID_CODE";
  sourceStatus: string;
  sourceDate: string;
  sourceAgencies: StorageAgency[];
};

export type WorkQueueAudit = {
  rawRows: number;
  normalizedRows: number;
  uniqueCodes: number;
  strictDuplicateCodes: number;
  divergentDuplicateCodes: number;
  excludedHistorical: number;
  excludedWrongAgency: number;
  invalidCodes: number;
  exclusions: WorkQueueExclusion[];
};

type DeliveryRow = {
  event_id?: string;
  tracking_code: string | null;
  agency: string;
  business_date: string;
  occurred_at: string;
  actor_name: string;
  weight_kg_delta: number | string;
};

export type PhysicalParcelRow = {
  tracking_code: string;
  agency: string;
  canonical_weight_kg: number | string;
  delivery_status: string;
};

let sourceCache: { expiresAt: number; payments: AdminPayment[]; manifest: ManifestShipperRow[] } | null = null;

export function parseQueueFilters(url: URL): QueueFilters {
  const section = url.searchParams.get("section") ?? "READY";
  if (!QUEUE_SECTIONS.includes(section as QueueSection)) throw new Error("INVALID_QUEUE_SECTION");
  const paymentSite = (url.searchParams.get("paymentSite") ?? "ALL").toUpperCase();
  if (!["ALL", "COO", "FIH", "LSHI", "KLZ"].includes(paymentSite)) throw new Error("INVALID_PAYMENT_SITE");
  const paymentStatus = (url.searchParams.get("paymentStatus") ?? "ALL").toUpperCase();
  if (!["ALL", "UNPAID", "PARTIAL", "PAID", "VERIFICATION"].includes(paymentStatus)) throw new Error("INVALID_PAYMENT_STATUS");
  return {
    section: section as QueueSection,
    query: bounded(url.searchParams.get("query"), 80),
    paymentSite: paymentSite as QueueFilters["paymentSite"],
    paymentStatus: paymentStatus as QueueFilters["paymentStatus"],
    paymentAgent: bounded(url.searchParams.get("paymentAgent"), 120),
    deliveryAgent: bounded(url.searchParams.get("deliveryAgent"), 120),
    from: dateFilter(url.searchParams.get("from")),
    to: dateFilter(url.searchParams.get("to")),
    page: boundedInteger(url.searchParams.get("page"), 1, 10_000, 1),
    pageSize: boundedInteger(url.searchParams.get("pageSize"), 5, 50, 12)
  };
}

export async function readAgentWorkQueue(input: {
  agency: StorageAgency;
  accountActive: boolean;
  deliveries: DeliveryRow[];
  physicalParcels: PhysicalParcelRow[];
  filters: QueueFilters;
}) {
  const { payments, manifest } = await readQueueSources();
  const { items } = buildParcelWorkQueueAudit({ payments, manifest, deliveries: input.deliveries, physicalParcels: input.physicalParcels, agency: input.agency, accountActive: input.accountActive });
  return { ...paginate(filterQueue(items, input.filters), input.filters.page, input.filters.pageSize), summary: summarizeQueue(items) };
}

export async function readAdminWorkQueue(input: {
  agency: StorageAgency;
  accountActive: boolean;
  deliveries: DeliveryRow[];
  physicalParcels: PhysicalParcelRow[];
  filters: QueueFilters;
}) {
  const { payments, manifest } = await readQueueSources();
  const { items, audit } = buildParcelWorkQueueAudit({ payments, manifest, deliveries: input.deliveries, physicalParcels: input.physicalParcels, agency: input.agency, accountActive: input.accountActive });
  return { ...paginate(filterQueue(items, input.filters), input.filters.page, input.filters.pageSize), summary: summarizeQueue(items), audit };
}

export function buildParcelWorkQueues(input: {
  payments: readonly AdminPayment[];
  manifest: readonly ManifestShipperRow[];
  deliveries: readonly DeliveryRow[];
  physicalParcels?: readonly PhysicalParcelRow[];
  agency: StorageAgency;
  accountActive: boolean;
}): WorkQueueItem[] {
  return buildParcelWorkQueueAudit(input).items;
}

export function buildParcelWorkQueueAudit(input: {
  payments: readonly AdminPayment[];
  manifest: readonly ManifestShipperRow[];
  deliveries: readonly DeliveryRow[];
  physicalParcels?: readonly PhysicalParcelRow[];
  agency: StorageAgency;
  accountActive: boolean;
}): { items: WorkQueueItem[]; audit: WorkQueueAudit } {
  const paymentsByCode = new Map<string, AdminPayment[]>();
  for (const payment of input.payments) {
    if (payment.destinationCode !== input.agency) continue;
    const code = normalizeCode(payment.codeColis);
    paymentsByCode.set(code, [...(paymentsByCode.get(code) ?? []), payment]);
  }
  const manifestByCode = new Map<string, ManifestShipperRow[]>();
  const sourceAgenciesByCode = new Map<string, Set<StorageAgency>>();
  const exclusions: WorkQueueExclusion[] = [];
  let normalizedRows = 0;
  let invalidCodes = 0;
  for (const row of input.manifest) {
    const code = normalizeCode(row.codeColisRaw);
    if (!code) { if (row.sourceSite === input.agency) invalidCodes += 1; continue; }
    const sourceAgencies = sourceAgenciesByCode.get(code) ?? new Set<StorageAgency>();
    sourceAgencies.add(row.sourceSite);
    sourceAgenciesByCode.set(code, sourceAgencies);
    if (row.sourceSite !== input.agency) continue;
    normalizedRows += 1;
    manifestByCode.set(code, [...(manifestByCode.get(code) ?? []), row]);
  }
  const deliveryByCode = new Map(input.deliveries.filter((row) => row.tracking_code).map((row) => [normalizeCode(row.tracking_code), row]));
  const physicalByCode = new Map((input.physicalParcels ?? []).filter((row) => row.agency === input.agency).map((row) => [normalizeCode(row.tracking_code), row]));
  const physicalPresenceKnown = input.physicalParcels !== undefined;
  const codes = new Set(Array.from(paymentsByCode.keys()).concat(Array.from(manifestByCode.keys()), Array.from(deliveryByCode.keys()), Array.from(physicalByCode.keys())));
  const strictDuplicateCodes = Array.from(manifestByCode.values()).filter((rows) => rows.length > 1 && new Set(rows.map(manifestFingerprint)).size === 1).length;
  const divergentDuplicateCodes = Array.from(manifestByCode.values()).filter((rows) => rows.length > 1 && new Set(rows.map(manifestFingerprint)).size > 1).length;
  const items = Array.from(codes).flatMap((trackingCode): WorkQueueItem[] => {
    const payments = paymentsByCode.get(trackingCode) ?? [];
    const manifestRows = manifestByCode.get(trackingCode) ?? [];
    const delivery = deliveryByCode.get(trackingCode);
    const physicalParcel = physicalByCode.get(trackingCode);
    const physicallyAvailable = physicalParcel?.delivery_status === "AVAILABLE";
    const sourceAgencies = Array.from(sourceAgenciesByCode.get(trackingCode) ?? []).sort() as StorageAgency[];
    if (!manifestRows.length && sourceAgencies.length && !delivery) {
      exclusions.push({ trackingCode, reason: "EXCLUDED_WRONG_AGENCY", sourceStatus: "", sourceDate: "", sourceAgencies });
      return [];
    }
    const canonicalRow = manifestRows.at(-1);
    if (canonicalRow && isHistoricalClosedStatus(canonicalRow.statutRaw) && !delivery) {
      exclusions.push({ trackingCode, reason: "EXCLUDED_HISTORICAL", sourceStatus: String(canonicalRow.statutRaw ?? "").trim(), sourceDate: String(canonicalRow.dateRaw ?? "").trim(), sourceAgencies: [input.agency] });
      return [];
    }
    const financial = buildEncaissementsFinancialProjection({ trackingCode, destination: input.agency, manifestRows, payments: input.payments });
    const amountExpected = financial.amountExpected;
    const amountPaid = financial.totalPaid;
    const remainingBalance = financial.remainingBalance;
    const weights = manifestRows.map((row) => parseStrictPositiveWeight(row.poidsRaw)).filter((value): value is number => value !== null);
    const weightKeys = new Set(weights.map((value) => value.toFixed(3)));
    const weightState = manifestRows.length === 0 || weights.length !== manifestRows.length ? "MISSING" : weightKeys.size === 1 ? "VALID" : "AMBIGUOUS";
    const statusEligible = manifestRows.length > 0 && manifestRows.every((row) => isAdmissibleOperationalStatus(row.statutRaw));
    const financialState = financial.financialState;
    const fullyPaid = financial.deliveryEligible;
    const exactBalanceRemaining = financial.collectionEligible;
    const paymentSites = Array.from(new Set(payments.map((row) => row.agenceEncaissement)));
    const delivered = Boolean(delivery);
    const blockingAnomalies = Array.from(new Set(financial.anomalies.concat(
      weightState === "MISSING" ? "WEIGHT_MISSING" : weightState === "AMBIGUOUS" ? "WEIGHT_CONFLICT" : "",
      statusEligible ? "" : "SOURCE_STATUS_INELIGIBLE",
      fullyPaid && physicalPresenceKnown && !physicallyAvailable ? "PHYSICAL_PRESENCE_MISSING" : ""
    ))).filter(Boolean);
    const deliveryStatus: WorkQueueItem["deliveryStatus"] = delivered
      ? "DELIVERED"
      : blockingAnomalies.length > 0 || financialState !== "COMPLETE"
        ? "VERIFICATION_REQUIRED"
        : fullyPaid
          ? "READY"
          : exactBalanceRemaining && amountPaid === 0
            ? "TO_COLLECT"
            : exactBalanceRemaining && amountPaid !== null && amountPaid > 0
              ? "PARTIAL_PAYMENT_REMAINING"
              : "VERIFICATION_REQUIRED";
    return [{
      trackingCode,
      beneficiary: "Confidentiel",
      destination: input.agency,
      weightKg: physicallyAvailable ? Number(physicalParcel.canonical_weight_kg) : weightState === "VALID" ? weights[0] : null,
      weightState,
      amountExpected,
      amountPaid,
      remainingBalance,
      paymentSites,
      paymentAgents: Array.from(new Set(payments.map((row) => row.agent).filter(Boolean))),
      paymentLabel: paymentLabel(paymentSites, fullyPaid, exactBalanceRemaining, amountPaid),
      deliveryStatus,
      financialState,
      anomalies: blockingAnomalies,
      deliveredAt: delivery?.occurred_at ?? null,
      businessDate: delivery?.business_date ?? null,
      deliveredBy: delivery?.actor_name ?? null,
      deliveryReference: delivery?.event_id ?? null,
      canConfirmDelivery: input.accountActive && deliveryStatus === "READY"
    }];
  });
  return {
    items,
    audit: {
      rawRows: input.manifest.filter((row) => row.sourceSite === input.agency).length,
      normalizedRows,
      uniqueCodes: manifestByCode.size,
      strictDuplicateCodes,
      divergentDuplicateCodes,
      excludedHistorical: exclusions.filter((row) => row.reason === "EXCLUDED_HISTORICAL").length,
      excludedWrongAgency: exclusions.filter((row) => row.reason === "EXCLUDED_WRONG_AGENCY").length,
      invalidCodes,
      exclusions
    }
  };
}

function filterQueue(items: WorkQueueItem[], filters: QueueFilters) {
  const query = normalizeSearch(filters.query);
  return items.filter((item) => {
    const sectionMatches = filters.section === "TO_COLLECT" ? item.deliveryStatus === "TO_COLLECT" : filters.section === "PARTIAL" ? item.deliveryStatus === "PARTIAL_PAYMENT_REMAINING" : filters.section === "READY" ? item.deliveryStatus === "READY" : filters.section === "VERIFICATION" ? item.deliveryStatus === "VERIFICATION_REQUIRED" : item.deliveryStatus === "DELIVERED";
    const paymentMatches = filters.paymentStatus === "ALL" || (filters.paymentStatus === "UNPAID" ? item.deliveryStatus === "TO_COLLECT" : filters.paymentStatus === "PARTIAL" ? item.deliveryStatus === "PARTIAL_PAYMENT_REMAINING" : filters.paymentStatus === "PAID" ? item.deliveryStatus === "READY" : item.deliveryStatus === "VERIFICATION_REQUIRED");
    return sectionMatches && (!query || normalizeSearch(`${item.trackingCode} ${item.beneficiary}`).includes(query)) && (filters.paymentSite === "ALL" || item.paymentSites.includes(filters.paymentSite)) && paymentMatches && (!filters.paymentAgent || item.paymentAgents.some((agent) => normalizeSearch(agent).includes(normalizeSearch(filters.paymentAgent)))) && (!filters.deliveryAgent || normalizeSearch(item.deliveredBy ?? "").includes(normalizeSearch(filters.deliveryAgent))) && (!filters.from || (item.businessDate ?? "9999-12-31") >= filters.from) && (!filters.to || (item.businessDate ?? "0000-01-01") <= filters.to);
  }).sort((a, b) => (b.deliveredAt ?? b.trackingCode).localeCompare(a.deliveredAt ?? a.trackingCode));
}

function paginate(items: WorkQueueItem[], page: number, pageSize: number) { const total = items.length; const totalPages = Math.max(1, Math.ceil(total / pageSize)); const safePage = Math.min(page, totalPages); return { items: items.slice((safePage - 1) * pageSize, safePage * pageSize), pagination: { page: safePage, pageSize, total, totalPages } }; }
function summarizeQueue(items: WorkQueueItem[]) { return { totalDeduplicated: items.length, toCollect: items.filter((item) => item.deliveryStatus === "TO_COLLECT").length, partialPaymentRemaining: items.filter((item) => item.deliveryStatus === "PARTIAL_PAYMENT_REMAINING").length, readyForDelivery: items.filter((item) => item.deliveryStatus === "READY").length, verificationRequired: items.filter((item) => item.deliveryStatus === "VERIFICATION_REQUIRED").length, recentlyDelivered: items.filter((item) => item.deliveryStatus === "DELIVERED").length, weightToVerify: items.filter((item) => item.weightState !== "VALID").length, unknownAmounts: items.filter((item) => item.amountExpected === null).length, conflicts: items.filter((item) => item.financialState === "CONFLICT").length, activeCollectionButtons: items.filter((item) => item.deliveryStatus === "TO_COLLECT" || item.deliveryStatus === "PARTIAL_PAYMENT_REMAINING").length, activeDeliveryButtons: items.filter((item) => item.canConfirmDelivery).length }; }
function paymentLabel(sites: string[], paid: boolean, exactBalanceRemaining: boolean, amountPaid: number | null) { if (paid && sites.length === 1 && sites[0] === "COO") return "Paiement intégral déjà effectué à COO — colis à remettre"; if (paid && sites.length > 1) return "Paiement réparti — prêt à remettre"; if (paid) return "Paiement complet — prêt à remettre"; if (exactBalanceRemaining) return sites.includes("COO") ? "Paiement partiel effectué à COO" : amountPaid === 0 ? "Aucun paiement — solde exact connu" : "Solde exact restant à encaisser"; return "Le montant attendu ou le solde exact n’est pas disponible. Vérification nécessaire avant encaissement."; }
function normalizeCode(value: unknown) { const code = String(value ?? "").trim().replace(/\s+/g, "").toUpperCase(); return /^[A-Z0-9-]{3,40}$/.test(code) ? code : ""; }
function manifestFingerprint(row: ManifestShipperRow) { return [row.dateRaw, row.codeColisRaw, row.poidsRaw, row.montantAttenduRaw, row.statutRaw].map((value) => String(value ?? "").trim()).join("\u001f"); }
function isHistoricalClosedStatus(value: unknown) { const normalized = String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); return /LIVRE|ANNULE|ARCHIVE|CANCEL/.test(normalized); }
function isAdmissibleOperationalStatus(value: unknown) { const normalized = String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, " ").toUpperCase(); return /(?:^|[^A-Z])(ENREGISTRE|EN ATTENTE|EN VOL|EN TRANSIT|ARRIVE|CODE RECU)(?:$|[^A-Z])/.test(normalized); }
function normalizeSearch(value: string) { return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); }
function bounded(value: string | null, max: number) { const normalized = value?.trim() ?? ""; if (normalized.length > max) throw new Error("INVALID_FILTER"); return normalized; }
function dateFilter(value: string | null) { const normalized = value?.trim() ?? ""; if (normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error("INVALID_DATE_FILTER"); return normalized; }
function boundedInteger(value: string | null, min: number, max: number, fallback: number) { if (!value) return fallback; const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error("INVALID_PAGINATION"); return parsed; }

async function readQueueSources() {
  const now = Date.now();
  if (sourceCache && sourceCache.expiresAt > now) return sourceCache;
  const [payments, manifest] = await Promise.all([readAdminPayments(), readCanonicalPaymentManifestRows()]);
  sourceCache = { payments, manifest, expiresAt: now + 30_000 };
  return sourceCache;
}
