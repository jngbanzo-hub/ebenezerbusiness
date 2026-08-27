import "server-only";

import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

import { buildInterAgencyReference, quoteInterAgencyRouting } from "@/server/inter-agency-routing";
import { businessDatePortoNovo, StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";
import { assertForwardingEnabled } from "@/server/forwarding-feature";

export type ForwardingOriginAgency = "KLZ" | "LSHI";

export async function departForwarding(input: { trackingCode: string; origin: ForwardingOriginAgency; destination: StorageAgency; requestId: string; actorId: string }) {
  assertForwardingEnabled();
  requireForwardingDestination(input.origin, input.destination);
  validateUuid(input.requestId);
  const quote = await readForwardingDepartureQuote(input.trackingCode, input.origin, input.destination);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    type: "STORAGE_FORWARDING_DEPARTURE", trackingCode: quote.trackingCode, origin: input.origin,
    destination: quote.destination, weightKg: quote.weightKg, rateUsdPerKg: quote.rateUsdPerKg,
    amountExpectedUsd: quote.amountExpectedUsd, requestId: input.requestId
  })).digest("hex");
  const { data, error } = await serviceClient().rpc("confirm_storage_forwarding_departure", {
    p_tracking_code: quote.trackingCode, p_destination_agency: quote.destination,
    p_canonical_weight_kg: quote.weightKg, p_forwarding_reference: quote.routingReference,
    p_expected_amount: quote.amountExpectedUsd, p_rate_usd_per_kg: quote.rateUsdPerKg,
    p_source_status: quote.sourceStatus, p_business_date: businessDatePortoNovo(),
    p_request_id: input.requestId, p_command_fingerprint: fingerprint, p_actor_id: input.actorId
  });
  if (error) throw mapError(error.message);
  return Object.freeze((data ?? {}) as { forwardingId?: string; forwardingReference?: string; state?: string; paymentCreated?: boolean; replayed?: boolean });
}

export async function readForwardingDepartureQuote(trackingCode: string, origin: ForwardingOriginAgency, destination: StorageAgency) {
  assertForwardingEnabled();
  requireForwardingDestination(origin, destination);
  const code = buildInterAgencyReference(trackingCode, origin, destination).slice(0, -(`-${origin}-${destination}`.length));
  const { data, error } = await serviceClient()
    .from("stockage_parcels")
    .select("parcel_id,tracking_code,canonical_weight_kg,delivery_status")
    .eq("agency", origin)
    .eq("tracking_code", code)
    .is("forwarding_id", null)
    .maybeSingle();
  if (error) throw new StockagesV2Error("FORWARDING_SERVICE_UNAVAILABLE", 503);
  if (!data || data.delivery_status !== "AVAILABLE") throw new StockagesV2Error("PARCEL_NOT_IN_STOCK", 404);
  const quote = quoteInterAgencyRouting({ trackingCode: data.tracking_code, origin, destination, weightKg: Number(data.canonical_weight_kg) });
  return Object.freeze({ ...quote, parcelId: data.parcel_id, forwardingReference: quote.routingReference, sourceStatus: "PHYSICAL_STORAGE" });
}

function requireForwardingDestination(origin: ForwardingOriginAgency, destination: StorageAgency) {
  const allowed = origin === "KLZ" ? destination === "LSHI" || destination === "FIH" : destination === "KLZ" || destination === "FIH";
  if (!allowed) throw new StockagesV2Error("FORWARDING_ROUTE_NOT_ALLOWED", 400);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
function validateUuid(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new StockagesV2Error("INVALID_REQUEST_ID", 400); }
function mapError(message: string) {
  const codes = ["IDEMPOTENCY_CONFLICT","PARCEL_NOT_IN_STOCK","PARCEL_WEIGHT_MISMATCH","WRONG_AGENCY","ACTIVE_AGENT_REQUIRED","STORAGE_ACCOUNT_SUSPENDED","INSUFFICIENT_STOCK","PARCEL_VERSION_CONFLICT","STORAGE_VERSION_CONFLICT","INVALID_FORWARDING_QUOTE","INVALID_FORWARDING_DEPARTURE"];
  const code = codes.find((value) => message.includes(value)) ?? "FORWARDING_SERVICE_UNAVAILABLE";
  return new StockagesV2Error(code, code === "WRONG_AGENCY" ? 403 : code === "FORWARDING_SERVICE_UNAVAILABLE" ? 503 : code.includes("CONFLICT") ? 409 : 400);
}
