import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readCanonicalPaymentsByRequestIds } from "@/server/admin-payments-sheets";
import { collectedPaymentDate, uniqueCompletedPaymentCandidate, type CollectedParcelIdentity, type CompletedDestinationPayment } from "@/server/agent-collected-payment-match";
import { parseForwardingAlias } from "@/server/storage-parcel-identity";
import type { StorageAgency } from "@/server/stockages-v2";

export type CollectedPaymentInfo =
  | { state: "CONFIRMED"; paidAt: string }
  | { state: "UNCONFIRMED" | "UNAVAILABLE" };

// Called only after the existing available-parcel search returned NOT_FOUND.
// Never changes that search result or payment/remittance eligibility.
export async function readCollectedPaymentInfo(
  requestedCode: string,
  agency: StorageAgency,
  requestedParcelId?: string
): Promise<CollectedPaymentInfo> {
  const alias = parseForwardingAlias(requestedCode);
  const code = (alias?.trackingCode ?? requestedCode).trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code) || (alias && alias.destinationAgency !== agency)) {
    return { state: "UNCONFIRMED" };
  }
  try {
    const client = serviceClient();
    let parcelsQuery = client.from("stockage_parcels")
      .select("parcel_id,forwarding_id,tracking_code,agency,delivered_event_id")
      .eq("tracking_code", code).eq("agency", agency).limit(2);
    if (requestedParcelId) parcelsQuery = parcelsQuery.eq("parcel_id", requestedParcelId);
    const { data: parcels, error: parcelError } = await parcelsQuery;
    if (parcelError) return { state: "UNAVAILABLE" };
    if (!parcels || parcels.length !== 1) return { state: "UNCONFIRMED" };
    const parcel = parcels[0];
    const identity: CollectedParcelIdentity = {
      parcelId: parcel.parcel_id,
      deliveredEventId: parcel.delivered_event_id,
      forwardingId: parcel.forwarding_id,
      trackingCode: parcel.tracking_code,
      agency: parcel.agency
    };
    if (alias) {
      if (!identity.forwardingId) return { state: "UNCONFIRMED" };
      const { data: forwarding, error } = await client.from("stockage_forwardings")
        .select("origin_agency,destination_agency")
        .eq("forwarding_id", identity.forwardingId).maybeSingle();
      if (error) return { state: "UNAVAILABLE" };
      if (forwarding?.origin_agency !== alias.originAgency || forwarding.destination_agency !== agency) return { state: "UNCONFIRMED" };
    } else if (identity.forwardingId) {
      // A bare code must never be taken as proof for a forwarding identity.
      return { state: "UNCONFIRMED" };
    }

    const completedOrchestrations = () => client.from("stockage_payment_orchestrations")
      .select("request_id,parcel_id,forwarding_id,tracking_code,agency,paid_amount,payment_created,state,cash_event_id,stockage_event_id")
      .eq("tracking_code", code).eq("agency", agency).eq("state", "COMPLETED");
    const [current, historical] = await Promise.all([
      completedOrchestrations().eq("parcel_id", identity.parcelId).limit(2),
      identity.deliveredEventId
        ? completedOrchestrations().is("parcel_id", null).eq("stockage_event_id", identity.deliveredEventId).limit(2)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (current.error || historical.error) return { state: "UNAVAILABLE" };
    const row = uniqueCompletedPaymentCandidate(current.data ?? [], historical.data ?? []);
    if (!row) return { state: "UNCONFIRMED" };
    const orchestration: CompletedDestinationPayment = {
      requestId: row.request_id,
      parcelId: row.parcel_id,
      forwardingId: row.forwarding_id,
      trackingCode: row.tracking_code,
      agency: row.agency,
      paidAmount: Number(row.paid_amount),
      paymentCreated: row.payment_created,
      state: row.state,
      cashEventId: row.cash_event_id,
      storageEventId: row.stockage_event_id
    };
    const lookup = (await readCanonicalPaymentsByRequestIds([orchestration.requestId]))
      .get(orchestration.requestId.toLowerCase());
    if (lookup?.status !== "FOUND") return { state: lookup?.status === "ABSENT" ? "UNCONFIRMED" : "UNAVAILABLE" };
    const paidAt = collectedPaymentDate(identity, orchestration, lookup.payment);
    return paidAt ? { state: "CONFIRMED", paidAt } : { state: "UNCONFIRMED" };
  } catch {
    return { state: "UNAVAILABLE" };
  }
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("STORAGE_SERVICE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
