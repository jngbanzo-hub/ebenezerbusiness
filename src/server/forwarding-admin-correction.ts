import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readCanonicalPaymentManifestRows } from "@/server/admin-manifest-sheets";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { nativeDestinationExpectedAmount } from "@/server/destination-payment-parcel";
import { correctionBlockers, type CorrectionEvidence } from "@/server/forwarding-admin-correction-policy";
import { verifyHistoricalTerms } from "@/server/forwarding-admin-correction-proof";
import { requireStorageAgency, type StorageAgency } from "@/server/stockages-v2";

type CorrectionTarget = { forwardingId: string; parcelId: string; agency: StorageAgency };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("STORAGE_CONFIGURATION_MISSING");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error("CORRECTION_READ_UNAVAILABLE");
  return result.data;
}

function parseUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("INVALID_CORRECTION_IDENTITY");
  return value;
}

export async function readForwardingCorrectionPreview(target: CorrectionTarget) {
  parseUuid(target.forwardingId);
  parseUuid(target.parcelId);
  requireStorageAgency(target.agency);
  const client = serviceClient();
  const forwarding = checked(await client.from("stockage_forwardings")
    .select("forwarding_id,original_tracking_code,origin_agency,destination_agency,canonical_weight_kg,amount_expected,amount_paid,cash_event_id,delivery_event_id,arrival_event_id,status,created_at,arrived_at,version,metadata")
    .eq("forwarding_id", target.forwardingId).maybeSingle());
  if (!forwarding || forwarding.destination_agency !== target.agency) throw new Error("CORRECTION_TARGET_NOT_FOUND");
  const origin = requireStorageAgency(forwarding.origin_agency);
  const destination = requireStorageAgency(forwarding.destination_agency);
  const code = String(forwarding.original_tracking_code ?? "").trim().toUpperCase();
  const weight = Number(forwarding.canonical_weight_kg);
  const [parcelResult, accountsResult, originIdentityResult, chainResult, originalArrivalsResult,
    orchestrationResult, paymentsResult, cashForwardingResult, cashParcelResult, auditResult,
    laterParcelEventsResult, manifestRows, canonicalPayments] = await Promise.all([
    client.from("stockage_parcels").select("parcel_id,forwarding_id,tracking_code,agency,canonical_weight_kg,delivery_status,version,created_at")
      .eq("parcel_id", target.parcelId).maybeSingle(),
    client.from("stockage_accounts").select("agency,status,current_parcel_count,current_weight_kg,version").in("agency", [origin, destination]),
    client.from("stockage_parcels").select("parcel_id").eq("agency", origin).eq("tracking_code", code).is("forwarding_id", null),
    client.from("stockage_events").select("event_id,event_type,agency,parcel_count_delta,weight_kg_delta,occurred_at,metadata")
      .eq("source_request_id", target.forwardingId),
    client.from("stockage_events").select("event_id,agency,event_type,occurred_at,metadata")
      .eq("agency", origin).eq("event_type", "MANUAL_ARRIVAL_RECORDED")
      .lte("occurred_at", forwarding.created_at).contains("metadata", { parcels: [{ trackingCode: code, weightKg: weight }] }),
    client.from("stockage_forwarding_orchestrations").select("request_id,state,payment_created,forwarding_id")
      .eq("forwarding_id", target.forwardingId),
    client.from("stockage_payment_orchestrations").select("request_id,state,payment_created")
      .eq("forwarding_id", target.forwardingId),
    client.from("cash_events").select("event_id").eq("source_id", target.forwardingId),
    client.from("cash_events").select("event_id").contains("metadata", { parcelId: target.parcelId }),
    client.from("stockage_admin_audit").select("audit_id").contains("metadata", { forwardingId: target.forwardingId }),
    client.from("stockage_events").select("event_id,occurred_at")
      .contains("metadata", { parcelId: target.parcelId }).gt("occurred_at", forwarding.arrived_at ?? forwarding.created_at),
    readCanonicalPaymentManifestRows(), readAdminPayments()
  ]);
  const parcel = checked(parcelResult);
  const accounts = checked(accountsResult) ?? [];
  const originIdentities = checked(originIdentityResult) ?? [];
  const chain = checked(chainResult) ?? [];
  const originalArrivals = checked(originalArrivalsResult) ?? [];
  const forwardingOrchestrations = checked(orchestrationResult) ?? [];
  const paymentOrchestrations = checked(paymentsResult) ?? [];
  const cashForwarding = checked(cashForwardingResult) ?? [];
  const cashParcel = checked(cashParcelResult) ?? [];
  const audits = checked(auditResult) ?? [];
  const laterParcelEvents = checked(laterParcelEventsResult) ?? [];
  const terms = verifyHistoricalTerms({ rows: manifestRows, payments: canonicalPayments,
    originAgency: origin, destinationAgency: destination, trackingCode: code,
    weightKg: weight, forwardingCreatedAt: forwarding.created_at });
  const departure = chain.filter(row => row.event_type === "SORTIE_POUR_ACHEMINEMENT" && row.agency === origin &&
    Number(row.parcel_count_delta) === -1 && Number(row.weight_kg_delta) === -weight);
  const arrival = chain.filter(row => row.event_type === "ARRIVAGE_ACHEMINEMENT" && row.agency === destination &&
    Number(row.parcel_count_delta) === 1 && Number(row.weight_kg_delta) === weight &&
    row.event_id === forwarding.arrival_event_id && (row.metadata as { parcelId?: string } | null)?.parcelId === target.parcelId);
  const relevantOrchestration = forwardingOrchestrations.filter(row => row.state === "ARRIVAL_CONFIRMED" && row.payment_created === false);
  const accountByAgency = new Map(accounts.map(row => [row.agency, row]));
  const evidence: CorrectionEvidence = {
    forwardingId: target.forwardingId, parcelId: target.parcelId, trackingCode: code,
    originAgency: origin, destinationAgency: destination, weightKg: weight,
    forwardingStatus: forwarding.status, forwardingAmountPaid: Number(forwarding.amount_paid),
    forwardingCashEventId: forwarding.cash_event_id, forwardingDeliveryEventId: forwarding.delivery_event_id,
    parcelAgency: parcel?.agency ?? "", parcelTrackingCode: parcel?.tracking_code ?? "",
    parcelForwardingId: parcel?.forwarding_id ?? null, parcelWeightKg: Number(parcel?.canonical_weight_kg ?? NaN),
    parcelStatus: parcel?.delivery_status ?? "", originAccountActive: accountByAgency.get(origin)?.status === "ACTIVE",
    destinationAccountActive: accountByAgency.get(destination)?.status === "ACTIVE",
    originNativeIdentityCount: originIdentities.length,
    relatedPaymentCount: paymentOrchestrations.length + forwardingOrchestrations.filter(row => row.payment_created).length,
    relatedCashEventCount: new Set([...cashForwarding, ...cashParcel].map(row => row.event_id)).size,
    laterPhysicalOperationCount: laterParcelEvents.filter(row => row.event_id !== forwarding.arrival_event_id).length,
    relatedCorrectionCount: audits.length,
    originArrivalEvidenceCount: originalArrivals.length,
    forwardingDepartureCount: departure.length, forwardingArrivalCount: arrival.length,
    forwardingOrchestrationCount: relevantOrchestration.length === 1 && forwardingOrchestrations.length === 1 ? 1 : 0,
    financialProof: terms.state, historicalExpectedUsd: terms.expectedUsd, historicalPaidUsd: terms.paidUsd,
    currentNativeExpectedUsd: nativeDestinationExpectedAmount(weight, origin)
  };
  const blockers = correctionBlockers(evidence);
  return {
    ready: blockers.length === 0, blockers, enabled: process.env.FORWARDING_ADMIN_CORRECTION_ENABLED === "true",
    identity: { forwardingId: target.forwardingId, parcelId: target.parcelId, trackingCode: code,
      originAgency: origin, destinationAgency: destination, weightKg: weight,
      forwardingStatus: forwarding.status, destinationParcelStatus: parcel?.delivery_status ?? null },
    financial: { historicalExpectedUsd: terms.expectedUsd, historicalPaidUsd: terms.paidUsd,
      source: terms.source, manifestDate: terms.manifestDate, manifestRowNumber: terms.manifestRowNumber,
      forwardingExpectedUsd: Number(forwarding.amount_expected), state: terms.state },
    effects: { destination: `−1 colis / −${weight} kg`, origin: `+1 colis / +${weight} kg`,
      payment: "Aucun paiement créé ni modifié", source: "Aucune écriture MANIFESTE/P1" },
    proof: { originArrivalEventId: originalArrivals.length === 1 ? originalArrivals[0].event_id : null,
      departureEventId: departure.length === 1 ? departure[0].event_id : null,
      destinationArrivalEventId: arrival.length === 1 ? arrival[0].event_id : null,
      forwardingVersion: forwarding.version }
  };
}

export async function executeForwardingCorrection(input: CorrectionTarget & {
  requestId: string; actorId: string; reason: string; physicalConfirmed: boolean;
}) {
  parseUuid(input.requestId);
  if (!input.physicalConfirmed || input.reason.trim().length < 10) throw new Error("CORRECTION_CONFIRMATION_REQUIRED");
  const preview = await readForwardingCorrectionPreview(input);
  if (!preview.enabled) throw new Error("CORRECTION_NOT_ENABLED");
  if (!preview.ready || !preview.proof.originArrivalEventId || !preview.proof.departureEventId ||
      !preview.proof.destinationArrivalEventId || preview.financial.historicalExpectedUsd === null ||
      !preview.financial.manifestRowNumber || !preview.financial.manifestDate) throw new Error("CORRECTION_PREFLIGHT_BLOCKED");
  const response = await serviceClient().rpc("correct_mistaken_forwarding", {
    p_request_id: input.requestId, p_forwarding_id: input.forwardingId, p_parcel_id: input.parcelId,
    p_expected_destination_agency: input.agency, p_expected_forwarding_version: preview.proof.forwardingVersion,
    p_origin_arrival_event_id: preview.proof.originArrivalEventId, p_departure_event_id: preview.proof.departureEventId,
    p_destination_arrival_event_id: preview.proof.destinationArrivalEventId,
    p_historical_expected_usd: preview.financial.historicalExpectedUsd,
    p_historical_paid_usd: preview.financial.historicalPaidUsd,
    p_current_native_expected_usd: nativeDestinationExpectedAmount(preview.identity.weightKg, requireStorageAgency(preview.identity.originAgency)),
    p_manifest_source: preview.financial.source, p_manifest_date: preview.financial.manifestDate,
    p_reason: input.reason.trim(), p_physical_confirmed: true, p_actor_id: input.actorId
  });
  if (response.error) throw new Error("CORRECTION_TRANSACTION_FAILED");
  return response.data;
}
