import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { readAdminPayments, readCanonicalPaymentsByRequestIds } from "@/server/admin-payments-sheets";
import { recordDestinationPayment } from "@/server/destination-payment-parcel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUEST_ID = "c3e47de2-956c-4147-b60f-363ae5742b40";
const PARCEL_ID = "8ad13a88-2790-482c-ab0e-53a42bccff33";
const TRACKING_CODE = "OT12926";
const AGENCY = "FIH";
const AMOUNT = 72;

function refuse(status = 409) {
  return NextResponse.json({ success: false, code: "OT12926_RESUME_NOT_CERTIFIED" }, { status });
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

function isSold(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === "SOLDE";
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return refuse(auth.status);
    if (auth.identity.site !== AGENCY) return refuse(403);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).length !== 1 || body.paymentRequestId !== REQUEST_ID) return refuse(400);

    const client = serviceClient();
    const [canonicalIndex, payments, orchestrationResult, parcelResult, allParcelsResult, accountResult, cashResult, storageResult, storageExitResult, sameCodeResult, sameParcelResult] = await Promise.all([
      readCanonicalPaymentsByRequestIds([REQUEST_ID]),
      readAdminPayments(),
      client.from("stockage_payment_orchestrations")
        .select("request_id,agency,tracking_code,parcel_id,forwarding_id,actor_name,expected_amount,paid_amount,command_fingerprint,state,payment_created,payment_response,cash_event_id,stockage_event_id")
        .eq("request_id", REQUEST_ID).maybeSingle(),
      client.from("stockage_parcels")
        .select("parcel_id,tracking_code,agency,forwarding_id,canonical_weight_kg,delivery_status")
        .eq("parcel_id", PARCEL_ID).maybeSingle(),
      client.from("stockage_parcels").select("parcel_id").eq("tracking_code", TRACKING_CODE).eq("agency", AGENCY).limit(2),
      client.from("stockage_accounts").select("status,current_parcel_count,current_weight_kg").eq("agency", AGENCY).maybeSingle(),
      client.from("cash_events").select("event_id").eq("source_type", "PAYMENT_ENGINE").eq("source_request_id", REQUEST_ID).limit(1),
      client.from("stockage_events").select("event_id").eq("request_id", REQUEST_ID).limit(1),
      client.from("stockage_events").select("event_id").eq("agency", AGENCY).eq("tracking_code", TRACKING_CODE).eq("event_type", "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION").limit(1),
      client.from("stockage_payment_orchestrations").select("request_id").eq("agency", AGENCY).eq("tracking_code", TRACKING_CODE).neq("request_id", REQUEST_ID).limit(1),
      client.from("stockage_payment_orchestrations").select("request_id").eq("parcel_id", PARCEL_ID).neq("request_id", REQUEST_ID).limit(1)
    ]);
    if (orchestrationResult.error || parcelResult.error || allParcelsResult.error || accountResult.error || cashResult.error || storageResult.error || storageExitResult.error || sameCodeResult.error || sameParcelResult.error) return refuse(503);

    const canonicalLookup = canonicalIndex.get(REQUEST_ID);
    const canonical = canonicalLookup?.status === "FOUND" ? canonicalLookup.payment : null;
    const sameCodePayments = payments.filter((payment) => payment.agenceEncaissement === AGENCY && payment.codeColis === TRACKING_CODE);
    if (!canonical || sameCodePayments.length !== 1 || sameCodePayments[0].paymentRequestId !== REQUEST_ID ||
        canonical.codeColis !== TRACKING_CODE || canonical.agenceEncaissement !== AGENCY || canonical.destinationCode !== AGENCY ||
        canonical.montantPaye !== AMOUNT || canonical.montantAttendu !== AMOUNT || canonical.soldeRestant !== 0 ||
        canonical.poidsKg !== 8 || !isSold(canonical.statutPaiement)) return refuse();

    const orchestration = orchestrationResult.data;
    const parcel = parcelResult.data;
    const account = accountResult.data;
    if (!orchestration?.command_fingerprint) return refuse();
    const cashFingerprintResult = await client.from("cash_events").select("event_id")
      .eq("source_type", "PAYMENT_ENGINE").contains("metadata", { commandFingerprint: orchestration.command_fingerprint }).limit(1);
    if (cashFingerprintResult.error) return refuse(503);
    if (!orchestration || orchestration.request_id !== REQUEST_ID || orchestration.agency !== AGENCY ||
        orchestration.tracking_code !== TRACKING_CODE || (orchestration.parcel_id && orchestration.parcel_id !== PARCEL_ID) ||
        orchestration.forwarding_id !== null || Number(orchestration.expected_amount) !== AMOUNT || Number(orchestration.paid_amount) !== AMOUNT ||
        orchestration.actor_name?.trim() !== canonical.agent.trim() || !/^[0-9a-f]{64}$/.test(orchestration.command_fingerprint ?? "") ||
        orchestration.state !== "PENDING" || orchestration.payment_created !== false || orchestration.payment_response !== null ||
        orchestration.cash_event_id !== null || orchestration.stockage_event_id !== null ||
        !parcel || parcel.parcel_id !== PARCEL_ID || parcel.tracking_code !== TRACKING_CODE || parcel.agency !== AGENCY ||
        parcel.forwarding_id !== null || parcel.delivery_status !== "AVAILABLE" || Number(parcel.canonical_weight_kg) !== 8 ||
        allParcelsResult.data?.length !== 1 || allParcelsResult.data[0].parcel_id !== PARCEL_ID ||
        !account || account.status !== "ACTIVE" || Number(account.current_parcel_count) < 1 || Number(account.current_weight_kg) < 8 ||
        (cashResult.data?.length ?? 0) !== 0 || (cashFingerprintResult.data?.length ?? 0) !== 0 ||
        (storageResult.data?.length ?? 0) !== 0 || (storageExitResult.data?.length ?? 0) !== 0 ||
        (sameCodeResult.data?.length ?? 0) !== 0 || (sameParcelResult.data?.length ?? 0) !== 0) return refuse();

    const outcome = await recordDestinationPayment({
      trackingCode: TRACKING_CODE,
      parcelId: PARCEL_ID,
      agency: AGENCY,
      paymentMode: canonical.modePaiement,
      paymentReference: canonical.reference,
      observation: canonical.observation,
      paymentRequestId: REQUEST_ID,
      agentUserId: auth.identity.userId,
      agentAccessToken: (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
    });
    const result = outcome.payment as Record<string, unknown>;
    if (result.success !== true || result.replayed !== true || result.paymentRequestId !== REQUEST_ID || outcome.forwardingId !== null) return refuse();
    return NextResponse.json({ success: true, paymentRequestId: REQUEST_ID, replayed: true });
  } catch {
    return refuse(503);
  }
}
