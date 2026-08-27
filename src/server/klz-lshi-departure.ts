import "server-only";

import { createClient } from "@supabase/supabase-js";

import { buildInterAgencyReference, quoteInterAgencyRouting } from "@/server/inter-agency-routing";
import { businessDatePortoNovo, StockagesV2Error } from "@/server/stockages-v2";

export function isKlzLshiDepartureEnabled() {
  return process.env.KLZ_LSHI_DEPARTURE_ENABLED?.trim().toLowerCase() === "true";
}

export async function readKlzLshiDepartureQuote(trackingCode: string) {
  const code = normalizeCode(trackingCode);
  const client = serviceClient();
  const [{ data: parcel, error: parcelError }, { data: forwarding, error: forwardingError }] = await Promise.all([
    client.from("stockage_parcels").select("tracking_code,agency,canonical_weight_kg,delivery_status").eq("agency", "KLZ").eq("tracking_code", code).is("forwarding_id", null).maybeSingle(),
    client.from("stockage_forwardings").select("forwarding_id,forwarding_reference,status,canonical_weight_kg,amount_paid,amount_expected").eq("origin_agency", "KLZ").eq("destination_agency", "LSHI").eq("original_tracking_code", code).maybeSingle()
  ]);
  if (parcelError || forwardingError) throw new StockagesV2Error("KLZ_LSHI_DEPARTURE_UNAVAILABLE", 503);
  if (!parcel || parcel.delivery_status !== "AVAILABLE") throw new StockagesV2Error("PARCEL_NOT_IN_STOCK", 409);
  const quote = quoteInterAgencyRouting({ trackingCode: code, origin: "KLZ", destination: "LSHI", weightKg: Number(parcel.canonical_weight_kg) });
  const expectedReference = buildInterAgencyReference(code, "KLZ", "LSHI");
  const ready = Boolean(
    forwarding && forwarding.forwarding_reference === expectedReference && forwarding.status === "PAID_AWAITING_ARRIVAL" &&
    Number(forwarding.canonical_weight_kg) === quote.weightKg && Number(forwarding.amount_paid) === Number(forwarding.amount_expected)
  );
  return Object.freeze({ ...quote, readyForDeparture: ready, readinessCode: ready ? null : "FORWARDING_NOT_READY_FOR_DEPARTURE" });
}

export async function confirmKlzLshiDeparture(input: { trackingCode: string; weightKg: number; forwardingReference: string; requestId: string; actorId: string }) {
  validateUuid(input.requestId);
  const { data, error } = await serviceClient().rpc("confirm_klz_lshi_departure", {
    p_tracking_code: normalizeCode(input.trackingCode),
    p_canonical_weight_kg: positive(input.weightKg),
    p_forwarding_reference: input.forwardingReference.trim().toUpperCase(),
    p_business_date: businessDatePortoNovo(),
    p_request_id: input.requestId,
    p_actor_id: input.actorId
  });
  if (error) throw mapError(error.message);
  return Object.freeze((data ?? {}) as { forwardingReference?: string; trackingCode?: string; state?: string; replayed?: boolean; eventId?: string });
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
function normalizeCode(value: unknown) { const code=String(value??"").trim().toUpperCase(); if(!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code))throw new StockagesV2Error("INVALID_TRACKING_CODE"); return code; }
function positive(value: unknown) { const number=Number(value); if(!Number.isFinite(number)||number<=0)throw new StockagesV2Error("PARCEL_WEIGHT_UNAVAILABLE",422); return number; }
function validateUuid(value:string){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new StockagesV2Error("INVALID_REQUEST_ID");}
function mapError(message:string){const codes=["IDEMPOTENCY_CONFLICT","FORWARDING_ALREADY_DEPARTED","FORWARDING_NOT_READY_FOR_DEPARTURE","INVALID_FORWARDING_REFERENCE","PARCEL_NOT_IN_STOCK","PARCEL_WEIGHT_MISMATCH","WRONG_AGENCY","ACTIVE_AGENT_REQUIRED","STORAGE_ACCOUNT_SUSPENDED","INSUFFICIENT_STOCK","PARCEL_VERSION_CONFLICT","STORAGE_VERSION_CONFLICT","FORWARDING_VERSION_CONFLICT","FORWARDING_ORCHESTRATION_CONFLICT"];const code=codes.find((value)=>message.includes(value))??"KLZ_LSHI_DEPARTURE_FAILED";const status=code==="WRONG_AGENCY"?403:code.includes("ALREADY")||code.includes("CONFLICT")?409:code.includes("SUSPENDED")?423:400;return new StockagesV2Error(code,status);}
