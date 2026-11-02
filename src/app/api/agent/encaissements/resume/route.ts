import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { readAdminPayments, readCanonicalPaymentsByRequestIds } from "@/server/admin-payments-sheets";
import { resolveDestinationPaymentParcel, resumePendingPaidDestination, resumeHistoricalNativePendingPaidDestination, type PaymentOrchestrationRow } from "@/server/destination-payment-parcel";
import { certifyDestinationResume } from "@/server/destination-payment-resume-guard";
import type { StorageAgency } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codePattern = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;

function refuse(status = 409) {
  return NextResponse.json({ success: false, code: "DESTINATION_RESUME_NOT_CERTIFIED" }, { status });
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("STORAGE_SERVICE_NOT_CONFIGURED");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) }
  }).schema("public");
}

async function readEligible(agency: StorageAgency, trackingCode: string, parcelId: string, requestId?: string) {
  const client = serviceClient();
  let pendingQuery = client.from("stockage_payment_orchestrations")
    .select("request_id,command_fingerprint,tracking_code,agency,actor_name,expected_amount,paid_amount,payment_created,payment_response,cash_event_id,stockage_event_id,state,parcel_id,forwarding_id,created_at")
    .eq("agency", agency).eq("tracking_code", trackingCode).eq("state", "PENDING");
  if (requestId) pendingQuery = pendingQuery.eq("request_id", requestId);
  const pending = await pendingQuery.limit(2);
  if (pending.error) throw new Error("STORAGE_READ_FAILED");
  if (pending.data?.length !== 1) return null;
  const orchestration = pending.data[0] as PaymentOrchestrationRow;

  const [canonicalIndex, payments, parcelResult, sameCodeParcels, accountResult, cashResult, fingerprintCashResult,
    storageResult, storageExitResult, otherOrchestrations, forwardings] = await Promise.all([
    readCanonicalPaymentsByRequestIds([orchestration.request_id]),
    readAdminPayments(),
    client.from("stockage_parcels").select("parcel_id,tracking_code,agency,forwarding_id,canonical_weight_kg,delivery_status,weight_source_reference,created_at")
      .eq("parcel_id", parcelId).maybeSingle(),
    client.from("stockage_parcels").select("parcel_id").eq("agency", agency).eq("tracking_code", trackingCode).limit(2),
    client.from("stockage_accounts").select("status,current_parcel_count,current_weight_kg").eq("agency", agency).maybeSingle(),
    client.from("cash_events").select("event_id,source_request_id,agency,amount,direction,metadata")
      .eq("source_type", "PAYMENT_ENGINE").eq("source_request_id", orchestration.request_id).limit(2),
    client.from("cash_events").select("event_id,source_request_id")
      .eq("source_type", "PAYMENT_ENGINE").contains("metadata", { commandFingerprint: orchestration.command_fingerprint }).limit(2),
    client.from("stockage_events").select("event_id").eq("request_id", orchestration.request_id).limit(1),
    client.from("stockage_events").select("event_id").eq("tracking_code", trackingCode).eq("agency", agency)
      .eq("event_type", "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION").limit(1),
    client.from("stockage_payment_orchestrations").select("request_id,parcel_id,state")
      .eq("agency", agency).eq("tracking_code", trackingCode).limit(1001),
    client.from("stockage_forwardings").select("forwarding_id")
      .eq("original_tracking_code", trackingCode).eq("destination_agency", agency).limit(1)
  ]);
  if ([parcelResult, sameCodeParcels, accountResult, cashResult, fingerprintCashResult, storageResult,
    storageExitResult, otherOrchestrations, forwardings].some((result) => result.error)) throw new Error("STORAGE_READ_FAILED");
  if ((otherOrchestrations.data?.length ?? 0) > 1000) return null;

  let arrivalEvent = null;
  let matchingArrivalEvents: Array<{ request_id: string }> = [];
  if (orchestration.parcel_id === null) {
    const source = parcelResult.data?.weight_source_reference ?? "";
    const arrivalRequestId = source.startsWith("arrival:") ? source.slice(8) : "";
    if (!uuid.test(arrivalRequestId)) return null;
    const [arrival, arrivals] = await Promise.all([
      client.from("stockage_events").select("request_id,agency,event_type,occurred_at,metadata")
        .eq("request_id", arrivalRequestId).maybeSingle(),
      client.from("stockage_events").select("request_id")
        .eq("agency", agency).eq("event_type", "MANUAL_ARRIVAL_RECORDED")
        .contains("metadata", { parcels: [{ trackingCode }] }).limit(2)
    ]);
    if (arrival.error || arrivals.error) throw new Error("STORAGE_READ_FAILED");
    arrivalEvent = arrival.data;
    matchingArrivalEvents = arrivals.data ?? [];
  }

  const canonicalLookup = canonicalIndex.get(orchestration.request_id.toLowerCase());
  const canonical = canonicalLookup?.status === "FOUND" ? canonicalLookup.payment : null;
  const sameCodePayments = payments.filter((payment) =>
    payment.agenceEncaissement === agency && payment.codeColis === trackingCode
  );
  const certified = certifyDestinationResume({
    agency, trackingCode, parcelId, orchestration,
    otherOrchestrations: otherOrchestrations.data ?? [], parcel: parcelResult.data,
    sameCodeParcels: sameCodeParcels.data ?? [], account: accountResult.data,
    canonical, sameCodePayments, cashRows: cashResult.data ?? [],
    fingerprintCashRows: fingerprintCashResult.data ?? [], storageRows: storageResult.data ?? [],
    storageExitRows: storageExitResult.data ?? [], relatedForwardings: forwardings.data ?? [],
    arrivalEvent, matchingArrivalEvents
  });
  if (!certified || !canonical) return null;

  const parcel = await resolveDestinationPaymentParcel(trackingCode, agency, undefined, parcelId);
  if (parcel.parcelId !== parcelId || parcel.forwardingId !== null || parcel.soldeRestant !== 0 ||
      parcel.montantAttendu !== canonical.montantAttendu || parcel.poidsKg !== canonical.poidsKg) return null;
  return { orchestration, parcel, canonical, arrivalRequestId: arrivalEvent?.request_id ?? null };
}

async function completedReplay(agency: StorageAgency, requestId: string) {
  const client = serviceClient();
  const { data: row, error } = await client.from("stockage_payment_orchestrations")
    .select("request_id,agency,tracking_code,parcel_id,forwarding_id,state,cash_event_id,stockage_event_id")
    .eq("request_id", requestId).maybeSingle();
  let completedParcelId = row?.parcel_id ?? null;
  if (!error && row?.state === "COMPLETED" && !completedParcelId) {
    const resumed = await client.from("stockage_payment_orchestrations")
      .select("resumed_parcel_id").eq("request_id", requestId).maybeSingle();
    if (resumed.error) return false;
    completedParcelId = resumed.data?.resumed_parcel_id ?? null;
  }
  if (error || !row || row.agency !== agency || row.forwarding_id !== null || row.state !== "COMPLETED" ||
      !completedParcelId || !row.cash_event_id || !row.stockage_event_id) return false;
  const [canonicalIndex, cash, storage, parcel] = await Promise.all([
    readCanonicalPaymentsByRequestIds([requestId]),
    client.from("cash_events").select("event_id,agency").eq("source_type", "PAYMENT_ENGINE")
      .eq("source_request_id", requestId).limit(2),
    client.from("stockage_events").select("event_id,agency,tracking_code,event_type,metadata")
      .eq("request_id", requestId).limit(2),
    client.from("stockage_parcels").select("parcel_id,agency,delivery_status").eq("parcel_id", completedParcelId).maybeSingle()
  ]);
  const canonical = canonicalIndex.get(requestId.toLowerCase());
  return !cash.error && !storage.error && !parcel.error && canonical?.status === "FOUND" &&
    canonical.payment.codeColis === row.tracking_code && canonical.payment.agenceEncaissement === agency &&
    canonical.payment.soldeRestant === 0 && cash.data?.length === 1 && cash.data[0].event_id === row.cash_event_id &&
    cash.data[0].agency === agency && storage.data?.length === 1 &&
    storage.data[0].event_id === row.stockage_event_id && storage.data[0].agency === agency &&
    storage.data[0].tracking_code === row.tracking_code &&
    storage.data[0].event_type === "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION" &&
    (row.parcel_id !== null || storage.data[0].metadata?.parcelId === completedParcelId) &&
    parcel.data?.agency === agency && !["AVAILABLE", "PRESENT"].includes(parcel.data.delivery_status);
}

async function completedReplayAfterRace(agency: StorageAgency, requestId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await completedReplay(agency, requestId)) return true;
    if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return refuse(auth.status);
    if (auth.identity.site === "COO") return refuse(403);
    const url = new URL(request.url);
    const trackingCode = url.searchParams.get("trackingCode")?.trim().toUpperCase() ?? "";
    const parcelId = url.searchParams.get("parcelId")?.trim() ?? "";
    if (!codePattern.test(trackingCode) || !uuid.test(parcelId)) return refuse(400);
    const eligible = await readEligible(auth.identity.site, trackingCode, parcelId);
    return NextResponse.json(eligible
      ? { eligible: true, paymentRequestId: eligible.orchestration.request_id }
      : { eligible: false }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return refuse(503);
  }
}

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL_ENV === "preview") return refuse(403);
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return refuse(auth.status);
    if (auth.identity.site === "COO") return refuse(403);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const requestId = body?.paymentRequestId;
    if (!body || Object.keys(body).length !== 1 || typeof requestId !== "string" || !uuid.test(requestId)) return refuse(400);

    const client = serviceClient();
    const { data: row, error } = await client.from("stockage_payment_orchestrations")
      .select("tracking_code,parcel_id,agency").eq("request_id", requestId).maybeSingle();
    if (error) return refuse(503);
    if (!row || row.agency !== auth.identity.site || !codePattern.test(row.tracking_code)) return refuse(403);
    let parcelId = row.parcel_id as string | null;
    if (!parcelId) {
      const parcels = await client.from("stockage_parcels").select("parcel_id")
        .eq("agency", auth.identity.site).eq("tracking_code", row.tracking_code).is("forwarding_id", null).limit(2);
      if (parcels.error) return refuse(503);
      if (parcels.data?.length !== 1) return refuse();
      parcelId = parcels.data[0].parcel_id;
    }
    if (!parcelId || !uuid.test(parcelId)) return refuse();
    const eligible = await readEligible(auth.identity.site, row.tracking_code, parcelId, requestId);
    if (!eligible) {
      if (await completedReplayAfterRace(auth.identity.site, requestId)) return NextResponse.json({ success: true, replayed: true, paymentRequestId: requestId });
      return refuse();
    }
    try {
      const outcome = eligible.orchestration.parcel_id === null
        ? await resumeHistoricalNativePendingPaidDestination({
          paymentRequestId: requestId, parcel: eligible.parcel, canonical: eligible.canonical,
          orchestration: eligible.orchestration, arrivalRequestId: eligible.arrivalRequestId,
          resumerId: auth.identity.userId
        })
        : await resumePendingPaidDestination({
          trackingCode: row.tracking_code, agency: auth.identity.site,
          parcelId, paymentRequestId: requestId,
          paymentReference: eligible.canonical.reference, observation: eligible.canonical.observation
        }, eligible.parcel, eligible.canonical.modePaiement, eligible.orchestration);
      const result = outcome?.payment as Record<string, unknown> | undefined;
      if (result?.success !== true || result.replayed !== true || result.paymentRequestId !== requestId || outcome?.forwardingId !== null) return refuse();
      return NextResponse.json({ success: true, replayed: true, paymentRequestId: requestId });
    } catch {
      if (await completedReplayAfterRace(auth.identity.site, requestId)) return NextResponse.json({ success: true, replayed: true, paymentRequestId: requestId });
      return refuse();
    }
  } catch {
    return refuse(503);
  }
}
