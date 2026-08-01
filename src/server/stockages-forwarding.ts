import "server-only";

import { createClient } from "@supabase/supabase-js";

import { resolveInterAgencyQuote } from "@/server/inter-agency-routing";
import {
  businessDatePortoNovo,
  requireStorageAgency,
  StockagesV2Error,
  type StorageAgency
} from "@/server/stockages-v2";

type RpcResult = Readonly<{
  eventId?: string;
  forwardingId?: string;
  forwardingReference?: string;
  replayed?: boolean;
  state?: string;
  version?: number;
}>;

export async function createInterAgencyForwarding(input: {
  trackingCode: string;
  origin: StorageAgency;
  destination: StorageAgency;
  amountPaid: number;
  paymentMode: string;
  paymentReference?: string;
  observation?: string;
  requestId: string;
  actorId: string;
}) {
  const quote = await resolveInterAgencyQuote({
    trackingCode: input.trackingCode,
    origin: input.origin,
    destination: input.destination
  });
  validateUuid(input.requestId);
  if (round(input.amountPaid) !== quote.amountExpectedUsd) {
    throw new StockagesV2Error("FORWARDING_PAYMENT_MUST_BE_EXACT", 422);
  }
  return rpc("record_inter_agency_forwarding", {
    p_original_tracking_code: quote.trackingCode,
    p_origin_agency: quote.origin,
    p_destination_agency: quote.destination,
    p_canonical_weight_kg: quote.weightKg,
    p_amount_paid: round(input.amountPaid),
    p_payment_mode: requiredText(input.paymentMode),
    p_payment_reference: clean(input.paymentReference),
    p_observation: clean(input.observation),
    p_business_date: businessDatePortoNovo(),
    p_request_id: input.requestId,
    p_actor_id: input.actorId
  });
}

export async function recordForwardingArrival(input: {
  forwardingReference: string;
  requestId: string;
  actorId: string;
  actorAgency: string;
}) {
  validateUuid(input.requestId);
  return rpc("record_forwarding_arrival", {
    p_forwarding_reference: normalizeReference(input.forwardingReference),
    p_destination_agency: requireStorageAgency(input.actorAgency),
    p_business_date: businessDatePortoNovo(),
    p_request_id: input.requestId,
    p_actor_id: input.actorId
  });
}

export async function confirmForwardingDelivery(input: {
  forwardingReference: string;
  requestId: string;
  actorId: string;
  actorAgency: string;
  physicalDeliveryConfirmed: boolean;
}) {
  validateUuid(input.requestId);
  if (input.physicalDeliveryConfirmed !== true) {
    throw new StockagesV2Error("PHYSICAL_CONFIRMATION_REQUIRED", 422);
  }
  return rpc("confirm_forwarding_delivery", {
    p_forwarding_reference: normalizeReference(input.forwardingReference),
    p_destination_agency: requireStorageAgency(input.actorAgency),
    p_physical_delivery_confirmed: true,
    p_business_date: businessDatePortoNovo(),
    p_request_id: input.requestId,
    p_actor_id: input.actorId
  });
}

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await serviceClient().rpc(name, args);
  if (error) throw mapError(error.message);
  return Object.freeze((data ?? {}) as RpcResult);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}

function mapError(message: string) {
  const codes = [
    "IDEMPOTENCY_CONFLICT", "FORWARDING_ROUTE_NOT_ALLOWED", "FORWARDING_ALREADY_EXISTS",
    "FORWARDING_ALREADY_ARRIVED", "FORWARDING_ALREADY_DELIVERED", "WRONG_AGENCY",
    "STORAGE_ACCOUNT_NOT_ACTIVE", "STOCK_INSUFFICIENT", "ACTIVE_AGENT_REQUIRED"
  ];
  const code = codes.find((candidate) => message.includes(candidate)) ?? "FORWARDING_COMMAND_FAILED";
  const status = code === "IDEMPOTENCY_CONFLICT" || code.includes("ALREADY") ? 409 : code === "WRONG_AGENCY" ? 403 : code.includes("NOT_ACTIVE") ? 423 : 400;
  return new StockagesV2Error(code, status);
}

function validateUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new StockagesV2Error("INVALID_REQUEST_ID");
  }
}
function normalizeReference(value: unknown) { return requiredReference(String(value ?? "").trim().toUpperCase()); }
function requiredReference(value: string) { if (!/^[A-Z0-9][A-Z0-9._/-]{5,95}$/.test(value)) throw new StockagesV2Error("INVALID_FORWARDING_REFERENCE"); return value; }
function requiredText(value: unknown) { const result = clean(value); if (!result) throw new StockagesV2Error("REQUIRED_FIELD_MISSING"); return result; }
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function round(value: number) { if (!Number.isFinite(value) || value <= 0) throw new StockagesV2Error("INVALID_AMOUNT"); return Math.round((value + Number.EPSILON) * 100) / 100; }
