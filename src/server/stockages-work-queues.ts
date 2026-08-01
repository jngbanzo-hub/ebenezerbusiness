import "server-only";

import { parseStrictPositiveWeight } from "@/features/admin/shippers";
import type { AdminPayment, ManifestShipperRow } from "@/features/admin/types";
import { readCanonicalPaymentManifestRows } from "@/server/admin-manifest-sheets";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { buildEncaissementsFinancialProjection } from "@/server/encaissements-financial-projection";
import { requireStorageAgency, type StorageAgency } from "@/server/stockages-v2";

export const QUEUE_SECTIONS = ["READY", "PENDING", "VERIFICATION", "RECENT"] as const;
export type QueueSection = (typeof QUEUE_SECTIONS)[number];

export type QueueFilters = {
  section: QueueSection;
  query: string;
  paymentSite: "ALL" | "COO" | StorageAgency;
  paymentStatus: "ALL" | "PAID" | "PENDING";
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
  deliveryStatus: "READY" | "PAYMENT_PENDING" | "VERIFICATION_REQUIRED" | "DELIVERED";
  financialState: "COMPLETE" | "INCOMPLETE" | "CONFLICT";
  anomalies: string[];
  deliveredAt: string | null;
  businessDate: string | null;
  deliveredBy: string | null;
  canConfirmDelivery: boolean;
};

type DeliveryRow = {
  tracking_code: string | null;
  agency: string;
  business_date: string;
  occurred_at: string;
  actor_name: string;
  weight_kg_delta: number | string;
};

let sourceCache: { expiresAt: number; payments: AdminPayment[]; manifest: ManifestShipperRow[] } | null = null;

export function parseQueueFilters(url: URL): QueueFilters {
  const section = url.searchParams.get("section") ?? "READY";
  if (!QUEUE_SECTIONS.includes(section as QueueSection)) throw new Error("INVALID_QUEUE_SECTION");
  const paymentSite = (url.searchParams.get("paymentSite") ?? "ALL").toUpperCase();
  if (!["ALL", "COO", "FIH", "LSHI", "KLZ"].includes(paymentSite)) throw new Error("INVALID_PAYMENT_SITE");
  const paymentStatus = (url.searchParams.get("paymentStatus") ?? "ALL").toUpperCase();
  if (!["ALL", "PAID", "PENDING"].includes(paymentStatus)) throw new Error("INVALID_PAYMENT_STATUS");
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
  filters: QueueFilters;
}) {
  const { payments, manifest } = await readQueueSources();
  const items = buildParcelWorkQueues({ payments, manifest, deliveries: input.deliveries, agency: input.agency, accountActive: input.accountActive });
  return { ...paginate(filterQueue(items, input.filters), input.filters.page, input.filters.pageSize), summary: summarizeQueue(items) };
}

export function buildParcelWorkQueues(input: {
  payments: readonly AdminPayment[];
  manifest: readonly ManifestShipperRow[];
  deliveries: readonly DeliveryRow[];
  agency: StorageAgency;
  accountActive: boolean;
}): WorkQueueItem[] {
  const paymentsByCode = new Map<string, AdminPayment[]>();
  for (const payment of input.payments) {
    if (payment.destinationCode !== input.agency) continue;
    const code = normalizeCode(payment.codeColis);
    paymentsByCode.set(code, [...(paymentsByCode.get(code) ?? []), payment]);
  }
  const manifestByCode = new Map<string, ManifestShipperRow[]>();
  for (const row of input.manifest) {
    const code = normalizeCode(row.codeColisRaw);
    if (!code) continue;
    manifestByCode.set(code, [...(manifestByCode.get(code) ?? []), row]);
  }
  const deliveryByCode = new Map(input.deliveries.filter((row) => row.tracking_code).map((row) => [normalizeCode(row.tracking_code), row]));
  const agencyManifestCodes = Array.from(manifestByCode.entries()).filter(([, rows]) => rows.some((row) => row.sourceSite === input.agency)).map(([code]) => code);
  const codes = new Set(Array.from(paymentsByCode.keys()).concat(agencyManifestCodes, Array.from(deliveryByCode.keys())));
  return Array.from(codes).map((trackingCode) => {
    const payments = paymentsByCode.get(trackingCode) ?? [];
    const financial = buildEncaissementsFinancialProjection({ trackingCode, destination: input.agency, manifestRows: input.manifest, payments: input.payments });
    const amountExpected = financial.amountExpected;
    const amountPaid = financial.totalPaid;
    const remainingBalance = financial.remainingBalance;
    const manifestRows = manifestByCode.get(trackingCode) ?? [];
    const weights = manifestRows.map((row) => parseStrictPositiveWeight(row.poidsRaw)).filter((value): value is number => value !== null);
    const weightKeys = new Set(weights.map((value) => value.toFixed(3)));
    const destinationConflict = manifestRows.some((row) => row.sourceSite !== input.agency);
    const weightState = manifestRows.length === 0 || weights.length !== manifestRows.length ? "MISSING" : weightKeys.size === 1 && !destinationConflict ? "VALID" : "AMBIGUOUS";
    const delivery = deliveryByCode.get(trackingCode);
    const financialState = financial.financialState;
    const fullyPaid = financial.deliveryEligible;
    const exactBalanceRemaining = financial.collectionEligible;
    const paymentSites = Array.from(new Set(payments.map((row) => row.agenceEncaissement)));
    const delivered = Boolean(delivery);
    return {
      trackingCode,
      beneficiary: "Confidentiel",
      destination: input.agency,
      weightKg: weightState === "VALID" ? weights[0] : null,
      weightState,
      amountExpected,
      amountPaid,
      remainingBalance,
      paymentSites,
      paymentAgents: Array.from(new Set(payments.map((row) => row.agent).filter(Boolean))),
      paymentLabel: paymentLabel(paymentSites, fullyPaid, exactBalanceRemaining, amountPaid),
      deliveryStatus: delivered ? "DELIVERED" : weightState !== "VALID" ? "VERIFICATION_REQUIRED" : fullyPaid ? "READY" : exactBalanceRemaining ? "PAYMENT_PENDING" : "VERIFICATION_REQUIRED",
      financialState,
      anomalies: Array.from(new Set(financial.anomalies.concat(weightState === "MISSING" ? "WEIGHT_MISSING" : weightState === "AMBIGUOUS" ? "WEIGHT_CONFLICT" : ""))).filter(Boolean),
      deliveredAt: delivery?.occurred_at ?? null,
      businessDate: delivery?.business_date ?? null,
      deliveredBy: delivery?.actor_name ?? null,
      canConfirmDelivery: input.accountActive && fullyPaid && financial.sourceEligible && !delivered && weightState === "VALID"
    };
  });
}

function filterQueue(items: WorkQueueItem[], filters: QueueFilters) {
  const query = normalizeSearch(filters.query);
  return items.filter((item) => {
    const sectionMatches = filters.section === "READY" ? item.deliveryStatus === "READY" : filters.section === "PENDING" ? item.deliveryStatus === "PAYMENT_PENDING" : filters.section === "VERIFICATION" ? item.deliveryStatus === "VERIFICATION_REQUIRED" : item.deliveryStatus === "DELIVERED";
    const paymentMatches = filters.paymentStatus === "ALL" || (filters.paymentStatus === "PAID" ? item.remainingBalance === 0 : item.remainingBalance !== 0);
    return sectionMatches && (!query || normalizeSearch(`${item.trackingCode} ${item.beneficiary}`).includes(query)) && (filters.paymentSite === "ALL" || item.paymentSites.includes(filters.paymentSite)) && paymentMatches && (!filters.paymentAgent || item.paymentAgents.some((agent) => normalizeSearch(agent).includes(normalizeSearch(filters.paymentAgent)))) && (!filters.deliveryAgent || normalizeSearch(item.deliveredBy ?? "").includes(normalizeSearch(filters.deliveryAgent))) && (!filters.from || (item.businessDate ?? "9999-12-31") >= filters.from) && (!filters.to || (item.businessDate ?? "0000-01-01") <= filters.to);
  }).sort((a, b) => (b.deliveredAt ?? b.trackingCode).localeCompare(a.deliveredAt ?? a.trackingCode));
}

function paginate(items: WorkQueueItem[], page: number, pageSize: number) { const total = items.length; const totalPages = Math.max(1, Math.ceil(total / pageSize)); const safePage = Math.min(page, totalPages); return { items: items.slice((safePage - 1) * pageSize, safePage * pageSize), pagination: { page: safePage, pageSize, total, totalPages } }; }
function summarizeQueue(items: WorkQueueItem[]) { return { totalDeduplicated: items.length, readyForDelivery: items.filter((item) => item.deliveryStatus === "READY").length, paymentPending: items.filter((item) => item.deliveryStatus === "PAYMENT_PENDING").length, verificationRequired: items.filter((item) => item.deliveryStatus === "VERIFICATION_REQUIRED").length, recentlyDelivered: items.filter((item) => item.deliveryStatus === "DELIVERED").length, weightToVerify: items.filter((item) => item.weightState !== "VALID").length, unknownAmounts: items.filter((item) => item.amountExpected === null).length, conflicts: items.filter((item) => item.financialState === "CONFLICT").length, activeCollectionButtons: items.filter((item) => item.deliveryStatus === "PAYMENT_PENDING" && item.remainingBalance !== null).length, activeDeliveryButtons: items.filter((item) => item.canConfirmDelivery).length }; }
function paymentLabel(sites: string[], paid: boolean, exactBalanceRemaining: boolean, amountPaid: number | null) { if (paid && sites.length === 1 && sites[0] === "COO") return "Paiement intégral déjà effectué à COO — colis à remettre"; if (paid && sites.length > 1) return "Paiement réparti — prêt à remettre"; if (paid) return "Paiement complet — prêt à remettre"; if (exactBalanceRemaining) return sites.includes("COO") ? "Paiement partiel effectué à COO" : amountPaid === 0 ? "Aucun paiement — solde exact connu" : "Solde exact restant à encaisser"; return "Le montant attendu ou le solde exact n’est pas disponible. Vérification nécessaire avant encaissement."; }
function normalizeCode(value: unknown) { const code = String(value ?? "").trim().toUpperCase(); return /^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code) ? code : ""; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
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
