import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readAdminManifestRows } from "@/server/admin-manifest-sheets";
import { readAdminPayments } from "@/server/admin-payments-sheets";

export const STORAGE_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;
export type StorageAgency = (typeof STORAGE_AGENCIES)[number];

export class StockagesV2Error extends Error {
  constructor(readonly code: string, readonly status = 400) {
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

export async function readAgentStorage(agency: StorageAgency) {
  const client = serviceClient();
  const [{ data: account, error: accountError }, { data: events, error: eventsError }, { data: activity, error: activityError }] = await Promise.all([
    client.from("stockage_accounts").select("agency,status,current_parcel_count,current_weight_kg,version,opened_business_date,updated_at").eq("agency", agency).single(),
    client.from("stockage_events").select("event_id,event_type,business_date,occurred_at,parcel_count_delta,weight_kg_delta,tracking_code,arrival_reference,actor_name,account_version_after").eq("agency", agency).order("occurred_at", { ascending: false }).limit(40),
    client.from("stockage_agent_activity").select("agency,business_date,actor_id,actor_name,arrivals,deliveries,arrived_weight_kg,delivered_weight_kg").eq("agency", agency).order("business_date", { ascending: false }).limit(40)
  ]);
  if (accountError || eventsError || activityError) throw new StockagesV2Error("STORAGE_READ_FAILED", 503);
  return { mode: "V2" as const, account, events: events ?? [], activity: activity ?? [], actionsEnabled: account?.status === "ACTIVE" };
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

export async function recordArrival(input: { parcelCount: number; weightKg: number; reference?: string; observation?: string; requestId: string; actorId: string }) {
  validateUuid(input.requestId);
  return rpc("record_manual_arrival", { p_parcel_count: positiveInteger(input.parcelCount), p_weight_kg: positive(input.weightKg), p_business_date: businessDatePortoNovo(), p_arrival_reference: clean(input.reference), p_observation: clean(input.observation), p_request_id: input.requestId, p_actor_id: input.actorId });
}

export async function resolveParcelForDelivery(trackingCode: string, agency: StorageAgency) {
  const code = normalizeTrackingCode(trackingCode);
  const [manifest, payments] = await Promise.all([readAdminManifestRows(), readAdminPayments()]);
  const occurrences = manifest.filter((row) => normalizeTrackingCode(row.codeColisRaw) === code);
  if (!occurrences.length) throw new StockagesV2Error("PARCEL_NOT_FOUND", 404);
  if (occurrences.some((row) => row.sourceSite !== agency)) throw new StockagesV2Error("PARCEL_AGENCY_MISMATCH", 409);
  const weights = occurrences.map((row) => parseWeight(row.poidsRaw));
  const keys = new Set(weights.map((weight) => weight.toFixed(3)));
  if (keys.size !== 1) throw new StockagesV2Error("PARCEL_WEIGHT_AMBIGUOUS", 422);
  const weightKg = weights[0];
  const snapshots = payments.filter((row) => normalizeTrackingCode(row.codeColis) === code);
  if (snapshots.some((row) => row.destinationCode !== agency || row.poidsKg === null || row.poidsKg.toFixed(3) !== weightKg.toFixed(3))) {
    throw new StockagesV2Error("PARCEL_WEIGHT_CONFLICT", 422);
  }
  return { trackingCode: code, agency, weightKg, weightSource: "SHIPPING_MANIFEST" as const, weightSourceReference: occurrences.map((row) => `${row.sourceSite}:${row.rowNumber}`).join(","), paymentSnapshot: snapshots.length ? { checked: true, references: snapshots.map((row) => row.reference || row.id) } : { checked: false } };
}

export async function confirmDelivery(input: { trackingCode: string; requestId: string; physicalConfirmed: boolean; actorId: string; agency: StorageAgency }) {
  validateUuid(input.requestId);
  if (input.physicalConfirmed !== true) throw new StockagesV2Error("PHYSICAL_CONFIRMATION_REQUIRED");
  const parcel = await resolveParcelForDelivery(input.trackingCode, input.agency);
  return rpc("confirm_parcel_delivery", { p_tracking_code: parcel.trackingCode, p_destination_agency: parcel.agency, p_canonical_weight_kg: parcel.weightKg, p_weight_source: parcel.weightSource, p_weight_source_reference: parcel.weightSourceReference, p_business_date: businessDatePortoNovo(), p_physical_delivery_confirmed: true, p_payment_snapshot: parcel.paymentSnapshot, p_request_id: input.requestId, p_actor_id: input.actorId });
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

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await serviceClient().rpc(name, args);
  if (error) throw mapRpcError(error.message);
  return (data ?? {}) as RpcResult;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}

function mapRpcError(message: string) {
  const codes = ["IDEMPOTENCY_CONFLICT", "STORAGE_ACCOUNT_NOT_ACTIVE", "STORAGE_ACCOUNT_NOT_SUSPENDED", "OPENING_STOCK_ALREADY_RECORDED", "PARCEL_ALREADY_DELIVERED", "INSUFFICIENT_STOCK", "PARCEL_VERSION_CONFLICT", "STORAGE_VERSION_CONFLICT", "ADMIN_REQUIRED", "ACTIVE_AGENT_REQUIRED"];
  const code = codes.find((candidate) => message.includes(candidate)) ?? "STORAGE_COMMAND_FAILED";
  return new StockagesV2Error(code, code === "IDEMPOTENCY_CONFLICT" || code.includes("ALREADY") ? 409 : code.includes("NOT_ACTIVE") ? 423 : 400);
}

function normalizeTrackingCode(value: unknown) { const code = String(value ?? "").trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code)) throw new StockagesV2Error("INVALID_TRACKING_CODE"); return code; }
function parseWeight(value: unknown) { const parsed = typeof value === "number" ? value : Number(String(value).replace(",", ".")); if (!Number.isFinite(parsed) || parsed <= 0) throw new StockagesV2Error("PARCEL_WEIGHT_UNAVAILABLE", 422); return parsed; }
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
