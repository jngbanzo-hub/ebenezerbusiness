import "server-only";

import { createHmac } from "crypto";

import { createClient } from "@supabase/supabase-js";

import type { Parcel } from "@/features/agent/types";
import { readAdminPaymentNextRow, readAdminPaymentWindow, readAdminPayments, readCanonicalPaymentsByRequestIds } from "@/server/admin-payments-sheets";
import { destinationPaymentFingerprint, originalPendingRequestId } from "@/server/destination-payment-retry-guard";
import { StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";
import type { OperationPerformanceTrace } from "@/server/operation-performance";
import { parseForwardingAlias, storageParcelDisplayCode, type StorageParcelIdentity } from "@/server/storage-parcel-identity";

const STANDARD_RATES_USD_PER_KG: Readonly<Record<StorageAgency, number>> = {
  FIH: 9,
  LSHI: 10,
  KLZ: 11
};

const DESTINATION_NAMES: Readonly<Record<StorageAgency, string>> = {
  FIH: "Kinshasa",
  LSHI: "Lubumbashi",
  KLZ: "Kolwezi"
};

export async function resolveDestinationPaymentParcel(
  trackingCode: string,
  agency: StorageAgency,
  trace?: OperationPerformanceTrace,
  parcelId?: string
): Promise<Readonly<Parcel>> {
  const alias = parseForwardingAlias(trackingCode);
  if (alias && alias.destinationAgency !== agency) throw new StockagesV2Error("WRONG_AGENCY", 403, undefined, "resolveDestinationPaymentParcel");
  const code = normalizeTrackingCode(alias?.trackingCode ?? trackingCode);
  const readStorage = async () => await serviceClient()
      .from("stockage_parcels")
      .select("parcel_id,forwarding_id,tracking_code,agency,canonical_weight_kg,delivery_status,created_at")
      .eq("tracking_code", code)
      .eq("agency", agency)
      .in("delivery_status", ["AVAILABLE", "PRESENT"])
      .limit(20);
  const { data: rows, error } = trace
    ? await trace.measure("stockage", readStorage)
    : await readStorage();

  if (error) throw new StockagesV2Error("STORAGE_READ_FAILED", 503, undefined, "resolveDestinationPaymentParcel");
  if (!rows?.length) {
    throw new StockagesV2Error("PARCEL_NOT_IN_AGENCY_STORAGE", 404, undefined, "resolveDestinationPaymentParcel");
  }
  const forwardingIds = rows.map((row) => row.forwarding_id).filter((value): value is string => typeof value === "string");
  const forwardings = forwardingIds.length ? await serviceClient().from("stockage_forwardings").select("forwarding_id,origin_agency,destination_agency,rate_usd_per_kg,amount_expected,amount_paid,status").in("forwarding_id", forwardingIds) : { data: [], error: null };
  if (forwardings.error) throw new StockagesV2Error("STORAGE_READ_FAILED", 503, undefined, "resolveDestinationPaymentParcel");
  const contextById = new Map((forwardings.data ?? []).map((row) => [row.forwarding_id, row]));
  const candidates = rows.map((row) => {
    const context = row.forwarding_id ? contextById.get(row.forwarding_id) : null;
    const identity: StorageParcelIdentity = { parcelId: row.parcel_id, forwardingId: row.forwarding_id, trackingCode: row.tracking_code, agency: row.agency, originAgency: context?.origin_agency, destinationAgency: context?.destination_agency };
    return { ...row, displayCode: storageParcelDisplayCode(identity), originAgency: context?.origin_agency ?? null, destinationAgency: context?.destination_agency ?? null };
  }).filter((candidate) => !alias || (candidate.forwarding_id && candidate.originAgency === alias.originAgency && candidate.destinationAgency === alias.destinationAgency));
  const parcel = parcelId ? candidates.find((candidate) => candidate.parcel_id === parcelId) : candidates.length === 1 ? candidates[0] : null;
  if (!parcel) throw new ParcelIdentitySelectionRequiredError(candidates.map((candidate) => ({ parcelId: candidate.parcel_id, forwardingId: candidate.forwarding_id, trackingCode: candidate.tracking_code, displayCode: candidate.displayCode, agency: candidate.agency })));

  const weightKg = Number(parcel.canonical_weight_kg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new StockagesV2Error("INVALID_CANONICAL_WEIGHT", 409, undefined, "resolveDestinationPaymentParcel");
  }

  const forwarding = parcel.forwarding_id ? contextById.get(parcel.forwarding_id) : null;
  if (forwarding && forwarding.status !== "ARRIVAL_CONFIRMED") {
    throw new StockagesV2Error("FORWARDING_ARRIVAL_NOT_CONFIRMED", 409, undefined, "resolveDestinationPaymentParcel");
  }
  const amountExpected = forwarding
    ? money(Number(forwarding.amount_expected))
    : money(weightKg * STANDARD_RATES_USD_PER_KG[agency]);
  const amountPaid = forwarding
    ? money(Number(forwarding.amount_paid))
    : await readNativeAmountPaid(code, agency, trace);
  const remainingBalance = money(Math.max(0, amountExpected - amountPaid));

  return Object.freeze({
    parcelId: parcel.parcel_id,
    forwardingId: parcel.forwarding_id,
    displayCode: parcel.displayCode,
    codeColis: code,
    dateColis: typeof parcel.created_at === "string" ? parcel.created_at : "",
    destinationCode: agency,
    destinationNom: DESTINATION_NAMES[agency],
    montantAttendu: amountExpected,
    montantDejaPaye: amountPaid,
    soldeRestant: remainingBalance,
    poidsKg: weightKg,
    statutColis: "AVAILABLE"
  });
}

export async function recordDestinationPayment(input: {
  trackingCode: string;
  agency: StorageAgency;
  paymentMode: string;
  paymentReference: string;
  observation: string;
  paymentRequestId: string;
  agentAccessToken: string;
  agentUserId: string;
  parcelId?: string;
}, trace?: OperationPerformanceTrace) {
  validateUuid(input.paymentRequestId);
  const paymentMode = requiredPaymentMode(input.paymentMode);
  const canonicalCode = normalizeTrackingCode(parseForwardingAlias(input.trackingCode)?.trackingCode ?? input.trackingCode);
  const existing = await readPaymentOrchestration(input.paymentRequestId);
  if (existing && (existing.tracking_code !== canonicalCode || existing.agency !== input.agency)) {
    throw new StockagesV2Error("IDEMPOTENCY_CONFLICT", 409, undefined, "recordDestinationPayment");
  }
  if (existing?.parcel_id && input.parcelId && existing.parcel_id !== input.parcelId) {
    throw new StockagesV2Error("IDEMPOTENCY_CONFLICT", 409, undefined, "recordDestinationPayment");
  }
  if (existing?.state === "COMPLETED") {
    if (!existing.cash_event_id || !existing.stockage_event_id) throw new StockagesV2Error("PAYMENT_ORCHESTRATION_PARTIAL_EFFECT", 409, undefined, "recordDestinationPayment");
    return Object.freeze({ payment: completedReplayPayload({ codeColis: canonicalCode, montantAttendu: Number(existing.expected_amount) }, input.paymentRequestId), forwardingId: existing.forwarding_id ?? null });
  }
  const parcel = await resolveDestinationPaymentParcel(input.trackingCode, input.agency, trace, input.parcelId);
  const validationStartedAt = performance.now();
  if (parcel.soldeRestant <= 0) {
    const resumed = await resumePendingPaidDestination(input, parcel, paymentMode, existing, trace);
    if (resumed) return resumed;
    throw new StockagesV2Error("PARCEL_ALREADY_PAID", 409, undefined, "recordDestinationPayment");
  }
  const operationContext = {
    type: "STORAGE_DESTINATION_PAYMENT",
    sourceDestinationCode: input.agency,
    collectionSiteCode: input.agency,
    canonicalWeightKg: parcel.poidsKg,
    canonicalExpectedAmount: parcel.montantAttendu,
    canonicalTotalPaid: parcel.montantDejaPaye,
    parcelId: parcel.parcelId,
    ...(parcel.forwardingId ? { forwardingId: parcel.forwardingId } : {})
  } as const;
  const paymentCommand = {
    codeColis: parcel.codeColis,
    destinationCode: input.agency,
    montantPaye: parcel.soldeRestant,
    modePaiement: paymentMode,
    referencePaiement: clean(input.paymentReference),
    observation: clean(input.observation),
    paymentRequestId: input.paymentRequestId,
    operationContext
  };
  const originalRequestId = !existing && !parcel.forwardingId
    ? await resolveOriginalPendingRequestId(input, parcel, paymentCommand)
    : null;
  const effectiveInput = originalRequestId ? { ...input, paymentRequestId: originalRequestId } : input;
  const body = JSON.stringify({ ...paymentCommand, paymentRequestId: effectiveInput.paymentRequestId });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.PAYMENTS_ORCHESTRATION_HMAC_SECRET?.trim();
  if (!url || !secret || !input.agentAccessToken) throw new StockagesV2Error("AGENT_SERVICE_UNAVAILABLE", 503, undefined, "recordDestinationPayment");
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  trace?.add("validation_metier", performance.now() - validationStartedAt);
  const invokePayment = () => fetch(`${url}/functions/v1/paiements-agents-enregistrer-paiement`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.agentAccessToken}`,
      "Content-Type": "application/json",
      "X-Ebe-Orchestration-Timestamp": timestamp,
      "X-Ebe-Orchestration-Signature": signature
    },
    body,
    cache: "no-store"
  });
  const response = trace
    ? await trace.measure("orchestration_paiement", invokePayment)
    : await invokePayment();
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload || payload.success === false) {
    const code = typeof payload?.error === "string" ? payload.error : typeof payload?.code === "string" ? payload.code : "AGENT_SERVICE_UNAVAILABLE";
    if (isUncertainPaidExitFailure(response.status, code)) {
      const resumed = await resumePendingPaidDestination(
        effectiveInput,
        parcel,
        paymentMode,
        await readPaymentOrchestration(effectiveInput.paymentRequestId),
        trace
      ).catch((cause) => {
        if (cause instanceof StockagesV2Error && cause.code === "CANONICAL_PAYMENT_NOT_CERTIFIED") return null;
        throw cause;
      });
      if (resumed) return resumed;
    }
    const status = code === "PARCEL_NOT_IN_STOCK" || code === "PARCEL_NOT_IN_AGENCY_STORAGE"
      ? 409
      : code === "SESSION_EXPIRED" || code === "SESSION_EXPIREE" || code === "SESSION_EXPIRED_REFRESHED"
        ? 401
        : response.status || 503;
    throw new StockagesV2Error(code, status, undefined, "EDGE_FUNCTION", response.status || 503);
  }
  return Object.freeze({
    payment: payload,
    forwardingId: parcel.forwardingId ?? null
  });
}

async function resolveOriginalPendingRequestId(
  input: { agency: StorageAgency; paymentRequestId: string; agentUserId: string },
  parcel: Readonly<Parcel>,
  command: {
    codeColis: string; destinationCode: string; montantPaye: number; modePaiement: string;
    referencePaiement: string; observation: string; operationContext: Record<string, unknown>;
  }
): Promise<string | null> {
  const client = serviceClient();
  const fingerprint = destinationPaymentFingerprint({
    actorUserId: input.agentUserId, agency: input.agency, ...command
  });
  const { data: row, error: lookupError } = await client.from("stockage_payment_orchestrations")
    .select("request_id,actor_id,agency,tracking_code,parcel_id,forwarding_id,expected_amount,paid_amount,command_fingerprint,state,payment_created,payment_response,cash_event_id,stockage_event_id,created_at")
    .eq("command_fingerprint", fingerprint).maybeSingle();
  if (lookupError) throw new StockagesV2Error("STORAGE_READ_FAILED", 503, undefined, "resolveOriginalPendingRequestId");
  if (!row) return null;
  const refuse = () => { throw new StockagesV2Error("IDEMPOTENCY_CONFLICT", 409, undefined, "resolveOriginalPendingRequestId"); };
  if (!parcel.parcelId || !row.created_at || !Number.isFinite(Date.parse(row.created_at))) return refuse();

  const requestIds = [row.request_id, input.paymentRequestId];
  const [canonical, payments, cashByRequest, cashByFingerprint, storageEvents, completed] = await Promise.all([
    readCanonicalPaymentsByRequestIds(requestIds),
    readCompleteAgencyPayments(input.agency),
    client.from("cash_events").select("event_id").eq("source_type", "PAYMENT_ENGINE").in("source_request_id", requestIds).limit(1),
    client.from("cash_events").select("event_id").eq("source_type", "PAYMENT_ENGINE").contains("metadata", { commandFingerprint: fingerprint }).limit(1),
    client.from("stockage_events").select("event_id").in("request_id", requestIds).limit(1),
    client.from("stockage_payment_orchestrations").select("request_id").eq("agency", input.agency)
      .eq("tracking_code", parcel.codeColis).eq("state", "COMPLETED").limit(1)
  ]);
  if (cashByRequest.error || cashByFingerprint.error || storageEvents.error || completed.error ||
      requestIds.some((id) => canonical.get(id.toLowerCase())?.status !== "ABSENT")) return refuse();
  const createdAt = Date.parse(row.created_at);
  const sheetsPayment = payments.some((payment) => {
    if (requestIds.some((id) => payment.paymentRequestId?.toLowerCase() === id.toLowerCase())) return true;
    if (normalizeTrackingCode(payment.codeColis) !== parcel.codeColis || payment.agenceEncaissement !== input.agency) return false;
    const paidAt = Date.parse(payment.dateTime);
    return !Number.isFinite(paidAt) || paidAt >= createdAt;
  });
  const requestId = originalPendingRequestId({
    actorId: input.agentUserId, agency: input.agency, trackingCode: parcel.codeColis,
    parcelId: parcel.parcelId, expectedAmount: parcel.soldeRestant,
    paidAmount: parcel.soldeRestant, fingerprint
  }, {
    requestId: row.request_id, actorId: row.actor_id, agency: row.agency,
    trackingCode: row.tracking_code, parcelId: row.parcel_id, forwardingId: row.forwarding_id,
    expectedAmount: Number(row.expected_amount), paidAmount: Number(row.paid_amount),
    fingerprint: row.command_fingerprint, state: row.state,
    paymentCreated: row.payment_created, paymentResponse: row.payment_response,
    cashEventId: row.cash_event_id, storageEventId: row.stockage_event_id
  }, {
    canonicalPayment: false, sheetsPayment,
    cashEvent: Boolean(cashByRequest.data?.length || cashByFingerprint.data?.length),
    storageEvent: Boolean(storageEvents.data?.length),
    concurrentCompleted: Boolean(completed.data?.length)
  });
  return requestId ?? refuse();
}

async function readCompleteAgencyPayments(agency: StorageAgency) {
  const lastRow = await readAdminPaymentNextRow(agency);
  const payments: Awaited<ReturnType<typeof readAdminPaymentWindow>>["payments"] = [];
  for (let row = 2; row < lastRow;) {
    const expected = Math.min(300, lastRow - row);
    const page = await readAdminPaymentWindow(agency, row, expected);
    if (page.scannedRows !== expected || page.nextRow !== row + expected) {
      throw new StockagesV2Error("CANONICAL_PAYMENT_READ_INCOMPLETE", 503, undefined, "readCompleteAgencyPayments");
    }
    payments.push(...page.payments);
    row = page.nextRow;
  }
  return payments;
}

function isUncertainPaidExitFailure(status: number, code: string) {
  return status >= 500 && [
    "AGENT_SERVICE_UNAVAILABLE",
    "PAYMENT_ORCHESTRATION_INCOMPLETE",
    "SERVICE_INDISPONIBLE"
  ].includes(code);
}

async function resumePendingPaidDestination(
  input: { trackingCode: string; agency: StorageAgency; paymentReference: string; observation: string; paymentRequestId: string; parcelId?: string },
  parcel: Readonly<Parcel>,
  paymentMode: string,
  existing: PaymentOrchestrationRow | null,
  trace?: OperationPerformanceTrace
) {
  if (parcel.forwardingId) return null;
  const client = serviceClient();
  const orchestration = existing;
  if (!orchestration) return null;
  if (orchestration.tracking_code !== parcel.codeColis || orchestration.agency !== input.agency) {
    throw new StockagesV2Error("IDEMPOTENCY_CONFLICT", 409, undefined, "resumePendingPaidDestination");
  }
  if (orchestration.parcel_id && orchestration.parcel_id !== parcel.parcelId) {
    throw new StockagesV2Error("IDEMPOTENCY_CONFLICT", 409, undefined, "resumePendingPaidDestination");
  }
  if (orchestration.state !== "PENDING" || orchestration.stockage_event_id) {
    throw new StockagesV2Error("PAYMENT_ORCHESTRATION_PARTIAL_EFFECT", 409, undefined, "resumePendingPaidDestination");
  }
  const [{ data: cashRows, error: cashError }, { data: storageRows, error: storageError }] = await Promise.all([
    client.from("cash_events").select("agency,amount,direction,metadata").eq("source_type", "PAYMENT_ENGINE").eq("source_request_id", input.paymentRequestId),
    client.from("stockage_events").select("event_id").eq("request_id", input.paymentRequestId)
  ]);
  if (cashError || storageError) throw new StockagesV2Error("STORAGE_READ_FAILED", 503, undefined, "resumePendingPaidDestination");
  if ((storageRows?.length ?? 0) !== 0 || (cashRows?.length ?? 0) > 1) {
    throw new StockagesV2Error("PAYMENT_ORCHESTRATION_PARTIAL_EFFECT", 409, undefined, "resumePendingPaidDestination");
  }
  const existingCash = cashRows?.[0];
  if (existingCash && (existingCash.agency !== input.agency || existingCash.direction !== "CREDIT" || money(Number(existingCash.amount)) !== money(Number(orchestration.paid_amount)) || existingCash.metadata?.commandFingerprint !== orchestration.command_fingerprint)) {
    throw new StockagesV2Error("IDEMPOTENCY_CONFLICT", 409, undefined, "resumePendingPaidDestination");
  }

  const payments = await readAdminPayments(trace);
  const canonical = payments.filter((payment) =>
    payment.paymentRequestId?.toLowerCase() === input.paymentRequestId.toLowerCase() &&
    normalizeTrackingCode(payment.codeColis) === parcel.codeColis &&
    payment.destinationCode === input.agency &&
    money(payment.montantPaye) === money(Number(orchestration.paid_amount)) &&
    money(payment.montantAttendu ?? 0) === money(Number(orchestration.expected_amount)) &&
    money(payment.soldeRestant ?? -1) === 0 &&
    money(payment.poidsKg ?? 0) === money(parcel.poidsKg) &&
    payment.agent.trim() === String(orchestration.actor_name).trim() &&
    requiredPaymentMode(payment.modePaiement) === paymentMode
  );
  if (canonical.length !== 1) throw new StockagesV2Error("CANONICAL_PAYMENT_NOT_CERTIFIED", 409, undefined, "resumePendingPaidDestination");
  const payment = canonical[0];
  const paymentResponse = {
    codeColis: parcel.codeColis,
    datePaiement: payment.dateTime,
    destinationCode: input.agency,
    destinationNom: parcel.destinationNom,
    montantPaye: payment.montantPaye,
    nouveauSolde: 0,
    nouveauTotalPaye: parcel.montantAttendu,
    statutPaiement: "SOLDE"
  };
  if (!orchestration.payment_created || !orchestration.payment_response) {
    const checkpoint = await client.rpc("checkpoint_paid_destination_payment", {
      p_request_id: input.paymentRequestId,
      p_command_fingerprint: orchestration.command_fingerprint,
      p_payment_response: paymentResponse
    });
    if (checkpoint.error) throw new StockagesV2Error("PAYMENT_ORCHESTRATION_INCOMPLETE", 503, undefined, "checkpoint_paid_destination_payment");
  }
  const finalized = await client.rpc("finalize_paid_destination_orchestration", {
    p_request_id: input.paymentRequestId,
    p_command_fingerprint: orchestration.command_fingerprint,
    p_business_date: payment.dateKey,
    p_payment_mode: payment.modePaiement,
    p_payment_reference: parcel.codeColis,
    p_observation: payment.observation
  });
  if (finalized.error || finalized.data?.state !== "COMPLETED") throw new StockagesV2Error("PAYMENT_ORCHESTRATION_INCOMPLETE", 503, undefined, "finalize_paid_destination_orchestration");
  return Object.freeze({ payment: completedReplayPayload(parcel, input.paymentRequestId), forwardingId: null });
}

type ReplayParcel = Pick<Parcel, "codeColis" | "montantAttendu">;
type PaymentOrchestrationRow = {
  request_id: string; command_fingerprint: string; tracking_code: string; agency: string; actor_name: string;
  expected_amount: number | string; paid_amount: number | string; payment_created: boolean; payment_response: unknown;
  cash_event_id: string | null; stockage_event_id: string | null; state: string; parcel_id: string | null; forwarding_id: string | null;
};

async function readPaymentOrchestration(requestId: string): Promise<PaymentOrchestrationRow | null> {
  const { data, error } = await serviceClient().from("stockage_payment_orchestrations")
    .select("request_id,command_fingerprint,tracking_code,agency,actor_name,expected_amount,paid_amount,payment_created,payment_response,cash_event_id,stockage_event_id,state,parcel_id,forwarding_id")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new StockagesV2Error("STORAGE_READ_FAILED", 503, undefined, "readPaymentOrchestration");
  return data as PaymentOrchestrationRow | null;
}

function completedReplayPayload(parcel: ReplayParcel, paymentRequestId: string) {
  return Object.freeze({
    success: true,
    codeColis: parcel.codeColis,
    montantPaye: parcel.montantAttendu,
    nouveauTotalPaye: parcel.montantAttendu,
    nouveauSolde: 0,
    statutPaiement: "SOLDE",
    cashRecorded: true,
    cashStatus: "RECORDED",
    paymentRequestId,
    replayed: true
  });
}

async function readNativeAmountPaid(code: string, agency: StorageAgency, trace?: OperationPerformanceTrace) {
  const payments = await readAdminPayments(trace);
  const matching = payments.filter((payment) => normalizeTrackingCode(payment.codeColis) === code && payment.destinationCode === agency);
  const requestIds = matching.map((payment) => payment.paymentRequestId).filter((value): value is string => Boolean(value));
  if (!requestIds.length) return money(matching.reduce((total, payment) => total + payment.montantPaye, 0));
  const { data, error } = await serviceClient().from("stockage_payment_orchestrations").select("request_id").in("request_id", requestIds).not("forwarding_id", "is", null);
  if (error) throw new StockagesV2Error("STORAGE_READ_FAILED", 503, undefined, "resolveDestinationPaymentParcel");
  const forwardingRequests = new Set((data ?? []).map((row) => String(row.request_id).toLowerCase()));
  return money(matching.reduce((total, payment) => forwardingRequests.has(payment.paymentRequestId?.toLowerCase() ?? "") ? total : total + payment.montantPaye, 0));
}

export class ParcelIdentitySelectionRequiredError extends StockagesV2Error {
  constructor(readonly candidates: readonly { parcelId: string; forwardingId: string | null; trackingCode: string; displayCode: string; agency: string }[]) {
    super("PARCEL_IDENTITY_SELECTION_REQUIRED", 409, undefined, "resolveDestinationPaymentParcel");
  }
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch }
  }).schema("public");
}

function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: "no-store" });
}

function normalizeTrackingCode(value: unknown) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code)) {
    throw new StockagesV2Error("INVALID_TRACKING_CODE");
  }
  return code;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function clean(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 500) : ""; }
function validateUuid(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new StockagesV2Error("INVALID_REQUEST_ID"); }
function requiredPaymentMode(value: string) { const mode=value.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace("_"," "); if(!["ESPECES","MOBILE MONEY","VIREMENT","AUTRE"].includes(mode))throw new StockagesV2Error("INVALID_PAYMENT_MODE"); return mode; }
