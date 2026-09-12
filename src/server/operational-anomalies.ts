import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { AdminSite } from "@/features/admin/types";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { readExhaustivePages, type PaginationMetrics } from "@/server/exhaustive-pagination";
import { readLatestLshiReconciliationReport } from "@/server/lshi-operational-reconciliation";
import { reconcileOperations, type CashClosure, type ReconciliationCash, type ReconciliationOrchestration, type ReconciliationPayment, type ReconciliationStorage } from "@/server/operational-reconciliation";

type SourceResult<T> = { available: true; rows: T[]; pagination?: PaginationMetrics } | { available: false; rows: T[]; error: string };
type ForwardingContext = { forwardingId: string; originAgency: AdminSite; destinationAgency: AdminSite };

export async function readOperationalAnomalies(now = new Date()) {
  const startedAt = performance.now();
  const [payments, cash, storage, orchestrations, closures, forwardings, lshiMonitoring] = await Promise.all([
    safe("ENCAISSEMENTS", readPayments), safe("CAISSE", () => paged<ReconciliationCash>("cash_events", "event_id,source_request_id,agency,amount,occurred_at,metadata", "event_id", (query) => query.eq("source_type", "PAYMENT_ENGINE"), (row) => ({ eventId: String(row.event_id), requestId: String(row.source_request_id).toLowerCase(), agency: agency(row.agency), amountUsd: Number(row.amount), occurredAt: String(row.occurred_at), ...metadataIdentity(row.metadata) }))),
    safe("STOCKAGE", () => paged<ReconciliationStorage>("stockage_events", "event_id,request_id,agency,tracking_code,weight_kg_delta,occurred_at,source_type,source_request_id,metadata", "event_id", (query) => query.in("event_type", ["SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", "SORTIE_APRES_REMISE_ACHEMINEMENT"]).not("request_id", "is", null), (row) => ({ eventId: String(row.event_id), requestId: String(row.request_id).toLowerCase(), agency: agency(row.agency), trackingCode: nullable(row.tracking_code), weightKg: row.weight_kg_delta === null ? null : Math.abs(Number(row.weight_kg_delta)), occurredAt: String(row.occurred_at), ...storageIdentity(row) }))),
    safe("ORCHESTRATION", () => paged<ReconciliationOrchestration>("stockage_payment_orchestrations", "request_id,tracking_code,agency,state,payment_created,cash_event_id,stockage_event_id,last_error,attempt_count,created_at,updated_at,completed_at,parcel_id,forwarding_id", "request_id", (query) => query, (row) => ({ requestId: String(row.request_id).toLowerCase(), trackingCode: String(row.tracking_code), agency: agency(row.agency), state: String(row.state), paymentCreated: row.payment_created === true, cashEventId: nullable(row.cash_event_id), storageEventId: nullable(row.stockage_event_id), lastError: nullable(row.last_error), attemptCount: Number(row.attempt_count), createdAt: String(row.created_at), updatedAt: String(row.updated_at), completedAt: nullable(row.completed_at), parcelId: nullable(row.parcel_id), forwardingId: nullable(row.forwarding_id) }))),
    safe("CONTINUITE", () => paged<CashClosure>("cash_daily_closures", "closure_id,agency,business_date,opening_balance,closing_balance,status,version,closed_at", "closure_id", (query) => query, (row) => ({ closureId: String(row.closure_id), agency: agency(row.agency), businessDate: String(row.business_date), openingBalance: Number(row.opening_balance), closingBalance: Number(row.closing_balance), status: String(row.status), version: Number(row.version), occurredAt: String(row.closed_at) }))),
    safe("FORWARDING", () => paged<ForwardingContext>("stockage_forwardings", "forwarding_id,origin_agency,destination_agency", "forwarding_id", (query) => query, (row) => ({ forwardingId: String(row.forwarding_id), originAgency: agency(row.origin_agency), destinationAgency: agency(row.destination_agency) }), forwardingPaginationIdentity)),
    safe("LSHI_RECONCILIATION", async () => ({ rows: [await readLatestLshiReconciliationReport()] }))
  ]);
  const contextById = new Map(forwardings.rows.map((row) => [row.forwardingId, row]));
  const enrich = <T extends { forwardingId?: string | null }>(rows: T[]) => rows.map((row) => ({ ...row, ...(row.forwardingId ? contextById.get(row.forwardingId) : undefined) }));
  const result = reconcileOperations({ payments: payments.rows, cash: enrich(cash.rows), storage: enrich(storage.rows), orchestrations: enrich(orchestrations.rows), closures: closures.rows, now, availability: { payments: payments.available, cash: cash.available, storage: storage.available, orchestrations: orchestrations.available, closures: closures.available } });
  const latestLshi = lshiMonitoring.available ? lshiMonitoring.rows[0] : null;
  const unavailable = [payments, cash, storage, orchestrations, closures, forwardings, lshiMonitoring].filter((source) => !source.available).length;
  const sourceNames = [["ENCAISSEMENTS", payments], ["CAISSE", cash], ["STOCKAGE", storage], ["ORCHESTRATION", orchestrations], ["CONTINUITE", closures], ["FORWARDING", forwardings], ["LSHI_RECONCILIATION", lshiMonitoring]] as const;
  const sourceAnomalies = sourceNames.flatMap(([source, value]) => value.available ? [] : [{
    id: `pagination:${source}`, category: "PAGINATION" as const, agency: null, trackingCode: null, paymentRequestId: null,
    type: "SOURCE_INDISPONIBLE_OU_LECTURE_INCOMPLETE", occurredAt: now.toISOString(), ageMinutes: 0, interruptedStep: "LECTURE",
    severity: "CRITICAL" as const, status: "A_VERIFIER" as const, cause: `${source}: lecture exhaustive non certifiée.`,
    recommendation: "Contrôler la source et la pagination. Ne pas conclure à zéro anomalie.", amountUsd: null, weightKg: null,
    parcelId: null, forwardingId: null, originAgency: null, destinationAgency: null, nature: "INDETERMINE" as const,
    dossierKey: `SOURCE:${source}`, temporalClass: "NOUVELLE_APRES_PROTECTIONS" as const
  }]);
  const paginations = [cash, storage, orchestrations, closures, forwardings].flatMap((source) => source.available && source.pagination ? [source.pagination] : []);
  const anomalies = uniqueAnomalies([...sourceAnomalies, ...(latestLshi?.anomalies ?? []), ...result.anomalies]);
  const information = uniqueAnomalies([...(latestLshi?.information ?? []), ...result.information]);
  return {
    generatedAt: now.toISOString(),
    anomalies,
    information,
    metrics: {
      ...result.metrics,
      realDossiers: new Set(anomalies.map((row) => row.dossierKey)).size,
      historicalBacklog: anomalies.filter((row) => row.temporalClass === "HISTORIQUE").length,
      newAfterProtections: anomalies.filter((row) => row.temporalClass === "NOUVELLE_APRES_PROTECTIONS").length,
      sourceUnavailable: unavailable,
      readersOver1000: paginations.filter((item) => item.exceededSinglePage).length,
      paginatedRows: paginations.reduce((sum, item) => sum + item.rowCount, 0),
      paginatedReadMs: Math.round(paginations.reduce((sum, item) => sum + item.durationMs, 0)),
      totalReadMs: Math.round(performance.now() - startedAt)
    },
    sources: {
      ENCAISSEMENTS: payments.available ? "AVAILABLE" : "UNAVAILABLE",
      CAISSE: cash.available ? "AVAILABLE" : "UNAVAILABLE",
      STOCKAGE: storage.available ? "AVAILABLE" : "UNAVAILABLE",
      ORCHESTRATION: orchestrations.available ? "AVAILABLE" : "UNAVAILABLE",
      CONTINUITE: closures.available ? "AVAILABLE" : "UNAVAILABLE",
      FORWARDING: forwardings.available ? "AVAILABLE" : "UNAVAILABLE",
      LSHI_RECONCILIATION: lshiMonitoring.available ? "AVAILABLE" : "UNAVAILABLE"
    }
  };
}

async function readPayments() {
  const rows: ReconciliationPayment[] = (await readAdminPayments()).flatMap((row) => row.paymentRequestId ? [{ requestId: row.paymentRequestId.toLowerCase(), trackingCode: row.codeColis, agency: row.destinationCode, amountUsd: row.montantPaye, weightKg: row.poidsKg, occurredAt: row.dateTime }] : []);
  return { rows };
}

async function paged<T>(table: string, columns: string, order: string, filter: (query: any) => any, decode: (row: Record<string, unknown>) => T, pageIdentity: (row: Record<string, unknown>) => string = identity) {
  const client = serviceClient();
  const result = await readExhaustivePages(async (from, to) => {
    const response = await filter(client.from(table).select(columns)).order(order, { ascending: true }).range(from, to);
    if (response.error || !Array.isArray(response.data)) throw new Error(`${table.toUpperCase()}_UNAVAILABLE`);
    return response.data as Record<string, unknown>[];
  }, { identity: pageIdentity });
  return { rows: result.rows.map(decode), pagination: result.metrics };
}

async function safe<T>(source: string, read: () => Promise<{ rows: T[]; pagination?: PaginationMetrics }>): Promise<SourceResult<T>> {
  try { return { available: true, ...(await read()) }; }
  catch (cause) { console.error("[operational-anomalies-source]", JSON.stringify({ source, error: cause instanceof Error ? cause.message : "UNKNOWN" })); return { available: false, rows: [], error: `${source}_UNAVAILABLE` }; }
}

function identity(row: unknown) { const value = row as Record<string, unknown>; return String(value.event_id ?? value.request_id ?? value.closure_id ?? ""); }
export function forwardingPaginationIdentity(row: Record<string, unknown>) { return String(row.forwarding_id ?? ""); }
function agency(value: unknown) { if (!["COO", "FIH", "LSHI", "KLZ"].includes(String(value))) throw new Error("INVALID_AGENCY"); return value as AdminSite; }
function nullable(value: unknown) { return typeof value === "string" && value.trim() ? value : null; }
function record(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function metadataIdentity(value: unknown) { const metadata = record(value); return { parcelId: nullable(metadata.parcelId), forwardingId: nullable(metadata.forwardingId) }; }
function storageIdentity(row: Record<string, unknown>) { const metadata = metadataIdentity(row.metadata); return { parcelId: metadata.parcelId, forwardingId: metadata.forwardingId ?? (row.source_type === "INTER_AGENCY_FORWARDING" ? nullable(row.source_request_id) : null) }; }
function uniqueAnomalies<T extends { id: string }>(rows: T[]) { return Array.from(new Map(rows.map((row) => [row.id, row])).values()); }
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(); if (!url || !key) throw new Error("SERVICE_NOT_CONFIGURED"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } }).schema("public"); }
