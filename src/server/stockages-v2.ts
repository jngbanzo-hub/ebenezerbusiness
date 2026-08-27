import "server-only";

import { createClient } from "@supabase/supabase-js";

import { buildStockagesRpcDiagnostic, type StockagesRpcDiagnosticContext, type StockagesRpcFailure } from "@/server/stockages-rpc-diagnostics";
import type { OperationPerformanceTrace } from "@/server/operation-performance";
import { storageParcelDisplayCode } from "@/server/storage-parcel-identity";


export const STORAGE_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;
export type StorageAgency = (typeof STORAGE_AGENCIES)[number];

export class StockagesV2Error extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
    readonly diagnosticId?: string,
    readonly technicalStage?: string,
    readonly externalHttpStatus?: number
  ) {
    super(code);
  }
}

type RpcResult = { eventId?: string; replayed?: boolean; version?: number; anomalyId?: string; status?: string };

export function isStockagesV2Enabled() {
  return process.env.STOCKAGES_V2_ENABLED === "true";
}

export function businessDatePortoNovo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Porto-Novo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function requireStorageAgency(value: string): StorageAgency {
  const normalized = value.trim().toUpperCase();
  if (!STORAGE_AGENCIES.includes(normalized as StorageAgency)) {
    throw new StockagesV2Error("STORAGE_AGENCY_NOT_SUPPORTED", 403);
  }
  return normalized as StorageAgency;
}

export async function readAgentStorage(agency: StorageAgency, trace?: OperationPerformanceTrace) {
  const client = serviceClient();
  const readSource = () => Promise.all([
    client.from("stockage_accounts").select("agency,status,current_parcel_count,current_weight_kg,version,opened_business_date,updated_at").eq("agency", agency).single(),
    client.from("stockage_events").select("event_id,event_type,business_date,occurred_at,parcel_count_delta,weight_kg_delta,tracking_code,arrival_reference,actor_name,account_version_after").eq("agency", agency).order("occurred_at", { ascending: false }).limit(40),
    client.from("stockage_agent_activity").select("agency,business_date,actor_id,actor_name,arrivals,deliveries,arrived_weight_kg,delivered_weight_kg").eq("agency", agency).order("business_date", { ascending: false }).limit(40),
    client.from("stockage_parcels").select("parcel_id,forwarding_id,tracking_code,agency,canonical_weight_kg,delivery_status,created_at,stockage_forwardings(origin_agency,destination_agency)").eq("agency", agency).in("delivery_status", ["AVAILABLE", "PRESENT"]).order("created_at", { ascending: false }).order("tracking_code", { ascending: true }),
    client.from("stockage_events").select("actor_name,occurred_at,metadata").eq("agency", agency).eq("event_type", "MANUAL_ARRIVAL_RECORDED").order("occurred_at", { ascending: false }).limit(1000)
  ]);
  const [{ data: account, error: accountError }, { data: events, error: eventsError }, { data: activity, error: activityError }, { data: parcels, error: parcelsError }, { data: arrivalEvents, error: arrivalEventsError }] = trace
    ? await trace.measure("lecture_source", readSource)
    : await readSource();
  if (accountError || eventsError || activityError || parcelsError || arrivalEventsError) throw new StockagesV2Error("STORAGE_READ_FAILED", 503);
  const parsingStartedAt = performance.now();
  const arrivalByCode = new Map<string, { actorName: string; occurredAt: string }>();
  for (const event of arrivalEvents ?? []) {
    const metadata = event.metadata as { parcels?: Array<{ trackingCode?: string }> } | null;
    for (const parcel of metadata?.parcels ?? []) {
      const code = String(parcel.trackingCode ?? "").trim().toUpperCase();
      if (code && !arrivalByCode.has(code)) arrivalByCode.set(code, { actorName: String(event.actor_name ?? ""), occurredAt: String(event.occurred_at ?? "") });
    }
  }
  const result = {
    mode: "V2" as const, account, events: events ?? [], activity: activity ?? [], actionsEnabled: account?.status === "ACTIVE",
    parcels: (parcels ?? []).map((parcel) => {
      const arrival = arrivalByCode.get(parcel.tracking_code);
      const context = Array.isArray(parcel.stockage_forwardings) ? parcel.stockage_forwardings[0] : parcel.stockage_forwardings;
      return { parcelId: parcel.parcel_id, forwardingId: parcel.forwarding_id, trackingCode: parcel.tracking_code, displayCode: storageParcelDisplayCode({ parcelId: parcel.parcel_id, forwardingId: parcel.forwarding_id, trackingCode: parcel.tracking_code, agency: parcel.agency, originAgency: context?.origin_agency, destinationAgency: context?.destination_agency }), agency: parcel.agency, weightKg: Number(parcel.canonical_weight_kg), status: parcel.delivery_status, arrivedAt: arrival?.occurredAt || parcel.created_at, arrivalAgent: arrival?.actorName || null };
    })
  };
  trace?.add("parsing_calculs", performance.now() - parsingStartedAt);
  return result;
}

export async function readAdminStorage() {
  const client = serviceClient();
  const [accounts, events, activity, anomalies, audit] = await Promise.all([
    client.from("stockage_accounts").select("agency,status,current_parcel_count,current_weight_kg,version,opened_business_date,updated_at").order("agency"),
    client.from("stockage_events").select("event_id,event_type,agency,business_date,occurred_at,parcel_count_delta,weight_kg_delta,tracking_code,arrival_reference,actor_name,account_version_after").order("occurred_at", { ascending: false }).limit(100),
    client.from("stockage_agent_activity").select("agency,business_date,actor_id,actor_name,arrivals,deliveries,arrived_weight_kg,delivered_weight_kg").order("business_date", { ascending: false }).limit(100),
    client.from("stockage_anomalies").select("anomaly_id,agency,tracking_code,anomaly_type,status,details,created_at,resolved_at,resolution_reason").order("created_at", { ascending: false }).limit(100),
    client.from("stockage_admin_audit").select("audit_id,action,agency,admin_name,old_value,new_value,reason,target_event_id,occurred_at").order("occurred_at", { ascending: false }).limit(100)
  ]);
  if ([accounts, events, activity, anomalies, audit].some((result) => result.error)) throw new StockagesV2Error("STORAGE_ADMIN_READ_FAILED", 503);
  return { mode: "V2" as const, accounts: accounts.data ?? [], events: events.data ?? [], activity: activity.data ?? [], anomalies: anomalies.data ?? [], audit: audit.data ?? [] };
}

export async function readAdminStorageParcels(agency: StorageAgency) {
  const client = serviceClient();
  const [{ data: account, error: accountError }, { data: parcels, error: parcelsError }, { data: arrivals, error: arrivalsError }] = await Promise.all([
    client.from("stockage_accounts").select("agency,status,current_parcel_count,current_weight_kg,version,opened_business_date,updated_at").eq("agency", agency).single(),
    client.from("stockage_parcels").select("parcel_id,forwarding_id,tracking_code,agency,canonical_weight_kg,delivery_status,created_at,updated_at,stockage_forwardings(origin_agency,destination_agency)").eq("agency", agency).in("delivery_status", ["AVAILABLE", "PRESENT"]).order("created_at", { ascending: false }).order("tracking_code", { ascending: true }),
    client.from("stockage_events").select("tracking_code,actor_name,occurred_at").eq("agency", agency).not("tracking_code", "is", null).gt("parcel_count_delta", 0).order("occurred_at", { ascending: false }).limit(1000)
  ]);
  if (accountError || parcelsError || arrivalsError) throw new StockagesV2Error("STORAGE_ADMIN_READ_FAILED", 503);
  const arrivalByCode = new Map<string, { actorName: string; occurredAt: string }>();
  for (const row of arrivals ?? []) {
    const code = String(row.tracking_code ?? "");
    if (code && !arrivalByCode.has(code)) arrivalByCode.set(code, { actorName: String(row.actor_name ?? ""), occurredAt: String(row.occurred_at ?? "") });
  }
  return {
    mode: "V2" as const,
    account,
    parcels: (parcels ?? []).map((parcel) => {
      const arrival = arrivalByCode.get(parcel.tracking_code);
      const context = Array.isArray(parcel.stockage_forwardings) ? parcel.stockage_forwardings[0] : parcel.stockage_forwardings;
      return {
        parcelId: parcel.parcel_id,
        forwardingId: parcel.forwarding_id,
        trackingCode: parcel.tracking_code,
        displayCode: storageParcelDisplayCode({ parcelId: parcel.parcel_id, forwardingId: parcel.forwarding_id, trackingCode: parcel.tracking_code, agency: parcel.agency, originAgency: context?.origin_agency, destinationAgency: context?.destination_agency }),
        agency: parcel.agency,
        weightKg: Number(parcel.canonical_weight_kg),
        status: parcel.delivery_status,
        arrivedAt: arrival?.occurredAt || parcel.created_at,
        arrivalAgent: arrival?.actorName || null
      };
    })
  };
}

export async function readStorageReportEvents(from: string, to = from, agency?: string) {
  let query = serviceClient()
    .from("stockage_events")
    .select("event_id,event_type,agency,business_date,occurred_at,parcel_count_delta,weight_kg_delta,tracking_code,actor_name,metadata")
    .gte("business_date", from)
    .lte("business_date", to)
    .order("occurred_at", { ascending: true });
  if (agency) query = query.eq("agency", agency);
  const { data, error } = await query;
  if (error) throw new StockagesV2Error("STORAGE_REPORT_READ_FAILED", 503);
  return data ?? [];
}

export type ArrivalParcel = Readonly<{ trackingCode: string; weightKg: number }>;

export function validateArrivalParcels(value: unknown): readonly ArrivalParcel[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) throw new StockagesV2Error("INVALID_ARRIVAL_PARCELS");
  const parcels = value.map((row) => {
    if (!row || typeof row !== "object") throw new StockagesV2Error("INVALID_ARRIVAL_PARCELS");
    const item = row as Record<string, unknown>;
    return Object.freeze({ trackingCode: normalizeTrackingCode(item.trackingCode), weightKg: positive(item.weightKg) });
  });
  if (new Set(parcels.map((parcel) => parcel.trackingCode)).size !== parcels.length) throw new StockagesV2Error("DUPLICATE_ARRIVAL_PARCEL", 409);
  return Object.freeze(parcels);
}

export async function recordArrival(input: { parcels: unknown; reference?: string; observation?: string; requestId: string; actorId: string; agency: StorageAgency }) {
  validateUuid(input.requestId);
  const parcels = validateArrivalParcels(input.parcels);
  return rpc("record_detailed_arrival", { p_parcels: parcels, p_business_date: businessDatePortoNovo(), p_arrival_reference: clean(input.reference), p_observation: clean(input.observation), p_request_id: input.requestId, p_actor_id: input.actorId }, { rpc: "record_detailed_arrival", agency: input.agency, commandType: "MANUAL_ARRIVAL" });
}

export async function confirmDelivery(input: { trackingCode: string; requestId: string; physicalConfirmed: boolean; actorId: string; agency: StorageAgency; weightKg: number; weightSourceReference: string; paymentSnapshot: Record<string, unknown> }) {
  validateUuid(input.requestId);
  if (input.physicalConfirmed !== true) throw new StockagesV2Error("PHYSICAL_CONFIRMATION_REQUIRED");
  return rpc("confirm_parcel_delivery", { p_tracking_code: normalizeTrackingCode(input.trackingCode), p_destination_agency: input.agency, p_canonical_weight_kg: positive(input.weightKg), p_weight_source: "PHYSICAL_ARRIVAL", p_weight_source_reference: requiredString(input.weightSourceReference), p_business_date: businessDatePortoNovo(), p_physical_delivery_confirmed: true, p_payment_snapshot: input.paymentSnapshot, p_request_id: input.requestId, p_actor_id: input.actorId });
}

export async function runAdminStorageCommand(action: string, body: Record<string, unknown>, actorId: string) {
  const requestId = requiredString(body.requestId);
  validateUuid(requestId);
  if (body.confirmed !== true) throw new StockagesV2Error("FINAL_CONFIRMATION_REQUIRED");
  if (action === "OPENING") return rpc("record_opening_stock", { p_agency: requireStorageAgency(requiredString(body.agency)), p_parcel_count: nonNegativeInteger(body.parcelCount), p_weight_kg: nonNegative(body.weightKg), p_business_date: requiredDate(body.businessDate), p_observation: clean(body.observation), p_request_id: requestId, p_actor_id: actorId });
  if (action === "ADJUSTMENT") return rpc("record_admin_stock_adjustment", { p_agency: requireStorageAgency(requiredString(body.agency)), p_direction: requiredString(body.direction), p_parcel_count: nonNegativeInteger(body.parcelCount), p_weight_kg: nonNegative(body.weightKg), p_business_date: requiredDate(body.businessDate), p_reason: requiredString(body.reason), p_request_id: requestId, p_actor_id: actorId });
  if (action === "CORRECTION") return rpc("record_stock_correction", { p_target_event_id: requiredString(body.targetEventId), p_corrected_parcel_delta: integer(body.correctedParcelDelta), p_corrected_weight_delta: numberValue(body.correctedWeightDelta), p_business_date: requiredDate(body.businessDate), p_reason: requiredString(body.reason), p_request_id: requestId, p_actor_id: actorId });
  if (action === "RESOLVE_ANOMALY") return rpc("resolve_stockage_anomaly", { p_anomaly_id: requiredString(body.anomalyId), p_reason: requiredString(body.reason), p_request_id: requestId, p_actor_id: actorId });
  throw new StockagesV2Error("UNKNOWN_STORAGE_COMMAND");
}

async function rpc(name: string, args: Record<string, unknown>, diagnosticContext?: StockagesRpcDiagnosticContext): Promise<RpcResult> {
  const { data, error } = await serviceClient().rpc(name, args);
  if (error) {
    const diagnosticId = crypto.randomUUID();
    const diagnostic = buildStockagesRpcDiagnostic(diagnosticId, error as StockagesRpcFailure, diagnosticContext ?? { rpc: name, commandType: "STORAGE_RPC" });
    console.error("[stockages-rpc-error]", JSON.stringify(diagnostic));
    throw mapRpcError(error.message, diagnosticId, name);
  }
  return (data ?? {}) as RpcResult;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch }
  }).schema("public");
}

function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: "no-store" });
}

function mapRpcError(message: string, diagnosticId?: string, rpcName?: string) {
  const codes = ["IDEMPOTENCY_CONFLICT", "STORAGE_ACCOUNT_NOT_ACTIVE", "STORAGE_ACCOUNT_NOT_SUSPENDED", "OPENING_STOCK_ALREADY_RECORDED", "PARCEL_ALREADY_DELIVERED", "INSUFFICIENT_STOCK", "PARCEL_VERSION_CONFLICT", "STORAGE_VERSION_CONFLICT", "ADMIN_REQUIRED", "ACTIVE_AGENT_REQUIRED"];
  const code = codes.find((candidate) => message.includes(candidate)) ?? "STORAGE_COMMAND_FAILED";
  return new StockagesV2Error(code, code === "IDEMPOTENCY_CONFLICT" || code.includes("ALREADY") ? 409 : code.includes("NOT_ACTIVE") ? 423 : 400, diagnosticId, rpcName ? `${rpcName}_RPC` : "STORAGE_RPC");
}

function normalizeTrackingCode(value: unknown) { const code = String(value ?? "").trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code)) throw new StockagesV2Error("INVALID_TRACKING_CODE"); return code; }
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function requiredString(value: unknown) { const result = clean(value); if (!result) throw new StockagesV2Error("REQUIRED_FIELD_MISSING"); return result; }
function validateUuid(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new StockagesV2Error("INVALID_REQUEST_ID"); }
function numberValue(value: unknown) { const result = Number(value); if (!Number.isFinite(result)) throw new StockagesV2Error("INVALID_NUMBER"); return result; }
function positive(value: unknown) { const result = numberValue(value); if (result <= 0) throw new StockagesV2Error("INVALID_POSITIVE_NUMBER"); return result; }
function nonNegative(value: unknown) { const result = numberValue(value); if (result < 0) throw new StockagesV2Error("INVALID_NON_NEGATIVE_NUMBER"); return result; }
function integer(value: unknown) { const result = numberValue(value); if (!Number.isInteger(result)) throw new StockagesV2Error("INVALID_INTEGER"); return result; }
function positiveInteger(value: unknown) { const result = integer(value); if (result <= 0) throw new StockagesV2Error("INVALID_POSITIVE_INTEGER"); return result; }
function nonNegativeInteger(value: unknown) { const result = integer(value); if (result < 0) throw new StockagesV2Error("INVALID_NON_NEGATIVE_INTEGER"); return result; }
function requiredDate(value: unknown) { const result = requiredString(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new StockagesV2Error("INVALID_BUSINESS_DATE"); return result; }
