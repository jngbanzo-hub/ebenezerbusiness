import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readAdminPayments, readCanonicalPaymentsByRequestIds } from "@/server/admin-payments-sheets";
import { collectedPaymentDate, confirmedCooPaymentSnapshot, confirmedDeliveryEvidence, uniqueCompletedPaymentCandidate, verifiedPaymentAgent, type CollectedParcelIdentity, type CompletedDestinationPayment } from "@/server/agent-collected-payment-match";
import { parseForwardingAlias } from "@/server/storage-parcel-identity";
import type { StorageAgency } from "@/server/stockages-v2";

export type CollectedPaymentInfo =
  | { state: "CONFIRMED"; paidAt: string; paidBy: string | null }
  | { state: "DELIVERED"; deliveredAt: string; deliveredBy: string | null; agency: StorageAgency; paidAtCoo: boolean }
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
      .select("parcel_id,forwarding_id,tracking_code,agency,delivery_status,delivered_event_id,delivered_by")
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
    let forwardingDeliveryEventId: string | null = null;
    if (alias) {
      if (!identity.forwardingId) return { state: "UNCONFIRMED" };
      const { data: forwarding, error } = await client.from("stockage_forwardings")
        .select("origin_agency,destination_agency,delivery_event_id")
        .eq("forwarding_id", identity.forwardingId).maybeSingle();
      if (error) return { state: "UNAVAILABLE" };
      if (forwarding?.origin_agency !== alias.originAgency || forwarding.destination_agency !== agency) return { state: "UNCONFIRMED" };
      forwardingDeliveryEventId = forwarding.delivery_event_id;
    } else if (identity.forwardingId) {
      // A bare code must never be taken as proof for a forwarding identity.
      return { state: "UNCONFIRMED" };
    }

    const completedOrchestrations = () => client.from("stockage_payment_orchestrations")
      .select("request_id,parcel_id,forwarding_id,tracking_code,agency,actor_name,paid_amount,payment_created,state,cash_event_id,stockage_event_id")
      .eq("tracking_code", code).eq("agency", agency).eq("state", "COMPLETED");
    const [current, historical] = await Promise.all([
      completedOrchestrations().eq("parcel_id", identity.parcelId).limit(2),
      identity.deliveredEventId
        ? completedOrchestrations().is("parcel_id", null).eq("stockage_event_id", identity.deliveredEventId).limit(2)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (current.error || historical.error) return { state: "UNAVAILABLE" };
    const row = uniqueCompletedPaymentCandidate(current.data ?? [], historical.data ?? []);
    if (!row) {
      // A conflicting destination-payment candidate must not be relabelled as a completed remittance.
      if ((current.data?.length ?? 0) + (historical.data?.length ?? 0) > 0 ||
        parcel.delivery_status !== "DELIVERED" || !identity.deliveredEventId ||
        (identity.forwardingId && forwardingDeliveryEventId !== identity.deliveredEventId)) return { state: "UNCONFIRMED" };
      const [delivery, corrections] = await Promise.all([
        client.from("stockage_events")
          .select("event_id,event_type,tracking_code,agency,actor_id,actor_name,actor_role,occurred_at,metadata")
          .eq("event_id", identity.deliveredEventId).maybeSingle(),
        client.from("stockage_events").select("event_id")
          .eq("target_event_id", identity.deliveredEventId).limit(1)
      ]);
      if (delivery.error || corrections.error) return { state: "UNAVAILABLE" };
      if (!delivery.data || corrections.data?.length) return { state: "UNCONFIRMED" };
      const evidence = confirmedDeliveryEvidence(
        { ...identity, deliveryStatus: parcel.delivery_status, deliveredBy: parcel.delivered_by },
        {
          eventId: delivery.data.event_id, eventType: delivery.data.event_type,
          trackingCode: delivery.data.tracking_code, agency: delivery.data.agency,
          actorId: delivery.data.actor_id, actorName: delivery.data.actor_name,
          actorRole: delivery.data.actor_role, occurredAt: delivery.data.occurred_at
        }
      );
      if (!evidence) return { state: "UNCONFIRMED" };
      const metadata = delivery.data.metadata;
      const snapshot = metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>).paymentSnapshot
        : null;
      let paidAtCoo = false;
      if (snapshot) {
        try {
          paidAtCoo = confirmedCooPaymentSnapshot(snapshot, await readAdminPayments(), identity, evidence.deliveredAt);
        } catch {
          // A missing P1 read cannot erase a confirmed physical remittance.
        }
      }
      return { state: "DELIVERED", deliveredAt: evidence.deliveredAt, deliveredBy: evidence.deliveredByName, agency, paidAtCoo };
    }
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
    return paidAt ? { state: "CONFIRMED", paidAt, paidBy: verifiedPaymentAgent(lookup.payment.agent, row.actor_name) } : { state: "UNCONFIRMED" };
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
