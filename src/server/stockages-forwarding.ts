import "server-only";

import { createHash, createHmac } from "crypto";

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
  paymentResponse?: Record<string, unknown>;
  paymentCreated?: boolean;
  replayed?: boolean;
  state?: string;
  version?: number;
}>;

export type ForwardingReadiness = Readonly<{
  ready: boolean;
  code: string | null;
}>;

export async function readForwardingReadiness(destination: StorageAgency): Promise<ForwardingReadiness> {
  const client = serviceClient();
  const [cash, storage] = await Promise.all([
    client.from("cash_accounts").select("id,status").eq("agency", destination).maybeSingle(),
    client.from("stockage_accounts").select("status,opened_business_date").eq("agency", destination).maybeSingle()
  ]);
  if (cash.error || storage.error) throw new StockagesV2Error("FORWARDING_SERVICE_UNAVAILABLE", 503);
  if (cash.data?.status !== "ACTIVE") return Object.freeze({ ready: false, code: "CASH_ACCOUNT_SUSPENDED" });
  const opening = await client.from("cash_events").select("event_id").eq("cash_account_id", cash.data.id).eq("event_type", "OPENING_BALANCE_RECORDED").limit(1).maybeSingle();
  if (opening.error) throw new StockagesV2Error("FORWARDING_SERVICE_UNAVAILABLE", 503);
  if (!opening.data) return Object.freeze({ ready: false, code: "INITIAL_BALANCE_REQUIRED" });
  if (storage.data?.status !== "ACTIVE") return Object.freeze({ ready: false, code: "STORAGE_ACCOUNT_SUSPENDED" });
  if (!storage.data.opened_business_date) return Object.freeze({ ready: false, code: "INITIAL_STOCK_REQUIRED" });
  return Object.freeze({ ready: true, code: null });
}

export async function createInterAgencyForwarding(input: {
  trackingCode: string;
  origin: StorageAgency;
  destination: StorageAgency;
  paymentMode: string;
  optionalReference?: string;
  optionalObservation?: string;
  paymentRequestId: string;
  actorId: string;
  agentAccessToken: string;
}) {
  validateUuid(input.paymentRequestId);
  const quote = await resolveInterAgencyQuote({
    trackingCode: input.trackingCode,
    origin: input.origin,
    destination: input.destination
  });
  const paymentMode = requiredText(input.paymentMode);
  const optionalReference = clean(input.optionalReference);
  const optionalObservation = clean(input.optionalObservation);
  const fingerprint = commandFingerprint({
    trackingCode: quote.trackingCode,
    origin: quote.origin,
    destination: quote.destination,
    paymentMode,
    optionalReference,
    optionalObservation,
    amountExpectedUsd: quote.amountExpectedUsd
  });

  const begun = await rpc("begin_inter_agency_forwarding", {
    p_actor_id: input.actorId,
    p_canonical_weight_kg: quote.weightKg,
    p_command_fingerprint: fingerprint,
    p_destination_agency: quote.destination,
    p_expected_amount: quote.amountExpectedUsd,
    p_origin_agency: quote.origin,
    p_original_tracking_code: quote.trackingCode,
    p_payment_mode: paymentMode,
    p_payment_reference: optionalReference,
    p_request_id: input.paymentRequestId,
    p_source_status: quote.sourceStatus
  });
  if (begun.state === "DELIVERED" || begun.state === "PAID_AWAITING_ARRIVAL" || begun.state === "READY_FOR_DELIVERY") {
    return Object.freeze({ ...begun, replayed: true });
  }

  let paymentResponse = begun.paymentResponse;
  if (!begun.paymentCreated || !paymentResponse) {
    paymentResponse = await invokeCanonicalPaymentEngine({
      accessToken: input.agentAccessToken,
      trackingCode: quote.trackingCode,
      destination: quote.destination,
      amount: quote.amountExpectedUsd,
      paymentMode,
      paymentReference: optionalReference,
      observation: optionalObservation,
      paymentRequestId: input.paymentRequestId,
      operationContext: {
        type: "INTER_AGENCY_FORWARDING",
        sourceDestinationCode: quote.origin,
        collectionSiteCode: quote.destination,
        forwardingDestinationCode: quote.destination,
        forwardingReference: quote.routingReference
      }
    });
    await rpc("checkpoint_inter_agency_payment", {
      p_command_fingerprint: fingerprint,
      p_payment_response: paymentResponse,
      p_request_id: input.paymentRequestId
    });
  }

  return rpc("finalize_inter_agency_forwarding", {
    p_command_fingerprint: fingerprint,
    p_request_id: input.paymentRequestId
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
  if (input.physicalDeliveryConfirmed !== true) throw new StockagesV2Error("PHYSICAL_CONFIRMATION_REQUIRED", 422);
  return rpc("confirm_forwarding_delivery", {
    p_forwarding_reference: normalizeReference(input.forwardingReference),
    p_destination_agency: requireStorageAgency(input.actorAgency),
    p_physical_delivery_confirmed: true,
    p_business_date: businessDatePortoNovo(),
    p_request_id: input.requestId,
    p_actor_id: input.actorId
  });
}

async function invokeCanonicalPaymentEngine(input: {
  accessToken: string;
  trackingCode: string;
  destination: StorageAgency;
  amount: number;
  paymentMode: string;
  paymentReference: string;
  observation: string;
  paymentRequestId: string;
  operationContext: {
    type: "INTER_AGENCY_FORWARDING";
    sourceDestinationCode: StorageAgency;
    collectionSiteCode: StorageAgency;
    forwardingDestinationCode: StorageAgency;
    forwardingReference: string;
  };
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const orchestrationKey = process.env.PAYMENTS_ORCHESTRATION_HMAC_SECRET?.trim();
  if (!url || !input.accessToken || !orchestrationKey) throw new StockagesV2Error("AGENT_SERVICE_UNAVAILABLE", 503);
  const body = JSON.stringify({
    codeColis: input.trackingCode,
    destinationCode: input.operationContext.sourceDestinationCode,
    montantPaye: input.amount,
    modePaiement: input.paymentMode,
    referencePaiement: input.paymentReference,
    observation: input.observation,
    paymentRequestId: input.paymentRequestId,
    operationContext: input.operationContext
  });
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", orchestrationKey).update(`${timestamp}.${body}`).digest("hex");
  let response: Response;
  try {
    response = await fetch(`${url}/functions/v1/paiements-agents-enregistrer-paiement`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "X-Ebe-Orchestration-Timestamp": timestamp,
        "X-Ebe-Orchestration-Signature": signature
      },
      body,
      cache: "no-store"
    });
  } catch {
    throw new StockagesV2Error("NETWORK_RESULT_UNKNOWN", 503);
  }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload || payload.success === false) {
    const code = typeof payload?.error === "string" ? payload.error : typeof payload?.code === "string" ? payload.code : "AGENT_SERVICE_UNAVAILABLE";
    throw new StockagesV2Error(code, response.status || 503);
  }
  return payload;
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

function commandFingerprint(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function mapError(message: string) {
  const codes = [
    "IDEMPOTENCY_CONFLICT", "FORWARDING_ROUTE_NOT_ALLOWED", "INVALID_INTER_AGENCY_ROUTE",
    "FORWARDING_ALREADY_EXISTS", "FORWARDING_ALREADY_ARRIVED", "FORWARDING_ALREADY_DELIVERED",
    "WRONG_AGENCY", "CASH_ACCOUNT_SUSPENDED", "INITIAL_BALANCE_REQUIRED",
    "STORAGE_ACCOUNT_SUSPENDED", "INITIAL_STOCK_REQUIRED", "SOURCE_PARCEL_NOT_ELIGIBLE",
    "PARCEL_ALREADY_DELIVERED", "ACTIVE_AGENT_REQUIRED"
  ];
  const code = codes.find((candidate) => message.includes(candidate)) ?? "FORWARDING_COMMAND_FAILED";
  const status = code === "IDEMPOTENCY_CONFLICT" || code.includes("ALREADY") ? 409 : code === "WRONG_AGENCY" ? 403 : code.includes("SUSPENDED") || code.includes("REQUIRED") ? 423 : 400;
  return new StockagesV2Error(code, status);
}

function validateUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new StockagesV2Error("INVALID_REQUEST_ID");
}
function normalizeReference(value: unknown) { const result = requiredText(value).toUpperCase(); if (!/^[A-Z0-9][A-Z0-9._/-]{5,95}$/.test(result)) throw new StockagesV2Error("INVALID_FORWARDING_REFERENCE"); return result; }
function requiredText(value: unknown) { const result = clean(value); if (!result) throw new StockagesV2Error("REQUIRED_FIELD_MISSING"); return result; }
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
