import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { AdminSite } from "@/features/admin/types";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { readExhaustivePages, type PaginationMetrics } from "@/server/exhaustive-pagination";
import { reconcileOperations, type CashClosure, type ReconciliationCash, type ReconciliationOrchestration, type ReconciliationPayment, type ReconciliationStorage } from "@/server/operational-reconciliation";

type SourceResult<T> = { available: true; rows: T[]; pagination?: PaginationMetrics } | { available: false; rows: T[]; error: string };

export async function readOperationalAnomalies(now = new Date()) {
  const startedAt = performance.now();
  const [payments, cash, storage, orchestrations, closures] = await Promise.all([
    safe("ENCAISSEMENTS", readPayments), safe("CAISSE", () => paged<ReconciliationCash>("cash_events", "event_id,source_request_id,agency,amount,occurred_at", "event_id", (query) => query.eq("source_type", "PAYMENT_ENGINE"), (row) => ({ eventId: String(row.event_id), requestId: String(row.source_request_id).toLowerCase(), agency: agency(row.agency), amountUsd: Number(row.amount), occurredAt: String(row.occurred_at) }))),
    safe("STOCKAGE", () => paged<ReconciliationStorage>("stockage_events", "event_id,request_id,agency,tracking_code,weight_kg_delta,occurred_at", "event_id", (query) => query.in("event_type", ["SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", "SORTIE_APRES_REMISE_ACHEMINEMENT"]).not("request_id", "is", null), (row) => ({ eventId: String(row.event_id), requestId: String(row.request_id).toLowerCase(), agency: agency(row.agency), trackingCode: nullable(row.tracking_code), weightKg: row.weight_kg_delta === null ? null : Math.abs(Number(row.weight_kg_delta)), occurredAt: String(row.occurred_at) }))),
    safe("ORCHESTRATION", () => paged<ReconciliationOrchestration>("stockage_payment_orchestrations", "request_id,tracking_code,agency,state,payment_created,cash_event_id,stockage_event_id,last_error,attempt_count,created_at,updated_at,completed_at", "request_id", (query) => query, (row) => ({ requestId: String(row.request_id).toLowerCase(), trackingCode: String(row.tracking_code), agency: agency(row.agency), state: String(row.state), paymentCreated: row.payment_created === true, cashEventId: nullable(row.cash_event_id), storageEventId: nullable(row.stockage_event_id), lastError: nullable(row.last_error), attemptCount: Number(row.attempt_count), createdAt: String(row.created_at), updatedAt: String(row.updated_at), completedAt: nullable(row.completed_at) }))),
    safe("CONTINUITE", () => paged<CashClosure>("cash_daily_closures", "closure_id,agency,business_date,opening_balance,closing_balance,status,version,closed_at", "closure_id", (query) => query, (row) => ({ closureId: String(row.closure_id), agency: agency(row.agency), businessDate: String(row.business_date), openingBalance: Number(row.opening_balance), closingBalance: Number(row.closing_balance), status: String(row.status), version: Number(row.version), occurredAt: String(row.closed_at) })))
  ]);
  const result = reconcileOperations({ payments: payments.rows, cash: cash.rows, storage: storage.rows, orchestrations: orchestrations.rows, closures: closures.rows, now, availability: { payments: payments.available, cash: cash.available, storage: storage.available, orchestrations: orchestrations.available, closures: closures.available } });
  const unavailable = [payments, cash, storage, orchestrations, closures].filter((source) => !source.available).length;
  const sourceNames = [["ENCAISSEMENTS", payments], ["CAISSE", cash], ["STOCKAGE", storage], ["ORCHESTRATION", orchestrations], ["CONTINUITE", closures]] as const;
  const sourceAnomalies = sourceNames.flatMap(([source, value]) => value.available ? [] : [{
    id: `pagination:${source}`, category: "PAGINATION" as const, agency: null, trackingCode: null, paymentRequestId: null,
    type: "SOURCE_INDISPONIBLE_OU_LECTURE_INCOMPLETE", occurredAt: now.toISOString(), ageMinutes: 0, interruptedStep: "LECTURE",
    severity: "CRITICAL" as const, status: "A_VERIFIER" as const, cause: `${source}: lecture exhaustive non certifiée.`,
    recommendation: "Contrôler la source et la pagination. Ne pas conclure à zéro anomalie.", amountUsd: null, weightKg: null
  }]);
  const paginations = [cash, storage, orchestrations, closures].flatMap((source) => source.available && source.pagination ? [source.pagination] : []);
  return {
    generatedAt: now.toISOString(),
    anomalies: [...sourceAnomalies, ...result.anomalies],
    metrics: {
      ...result.metrics,
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
      CONTINUITE: closures.available ? "AVAILABLE" : "UNAVAILABLE"
    }
  };
}

async function readPayments() {
  const rows: ReconciliationPayment[] = (await readAdminPayments()).flatMap((row) => row.paymentRequestId ? [{ requestId: row.paymentRequestId.toLowerCase(), trackingCode: row.codeColis, agency: row.destinationCode, amountUsd: row.montantPaye, occurredAt: row.dateTime }] : []);
  return { rows };
}

async function paged<T>(table: string, columns: string, order: string, filter: (query: any) => any, decode: (row: Record<string, unknown>) => T) {
  const client = serviceClient();
  const result = await readExhaustivePages(async (from, to) => {
    const response = await filter(client.from(table).select(columns)).order(order, { ascending: true }).range(from, to);
    if (response.error || !Array.isArray(response.data)) throw new Error(`${table.toUpperCase()}_UNAVAILABLE`);
    return response.data as Record<string, unknown>[];
  }, { identity: (row) => identity(row) });
  return { rows: result.rows.map(decode), pagination: result.metrics };
}

async function safe<T>(source: string, read: () => Promise<{ rows: T[]; pagination?: PaginationMetrics }>): Promise<SourceResult<T>> {
  try { return { available: true, ...(await read()) }; }
  catch (cause) { console.error("[operational-anomalies-source]", JSON.stringify({ source, error: cause instanceof Error ? cause.message : "UNKNOWN" })); return { available: false, rows: [], error: `${source}_UNAVAILABLE` }; }
}

function identity(row: unknown) { const value = row as Record<string, unknown>; return String(value.event_id ?? value.request_id ?? value.closure_id ?? ""); }
function agency(value: unknown) { if (!["COO", "FIH", "LSHI", "KLZ"].includes(String(value))) throw new Error("INVALID_AGENCY"); return value as AdminSite; }
function nullable(value: unknown) { return typeof value === "string" && value.trim() ? value : null; }
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(); if (!url || !key) throw new Error("SERVICE_NOT_CONFIGURED"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } }).schema("public"); }
