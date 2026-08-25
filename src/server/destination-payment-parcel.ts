import "server-only";

import { createHmac } from "crypto";

import { createClient } from "@supabase/supabase-js";

import type { Parcel } from "@/features/agent/types";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";
import type { OperationPerformanceTrace } from "@/server/operation-performance";

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
  trace?: OperationPerformanceTrace
): Promise<Readonly<Parcel>> {
  const code = normalizeTrackingCode(trackingCode);
  const readStorage = async () => await serviceClient()
      .from("stockage_parcels")
      .select("tracking_code,agency,canonical_weight_kg,delivery_status,created_at")
      .eq("tracking_code", code)
      .eq("agency", agency)
      .maybeSingle();
  const { data: parcel, error } = trace
    ? await trace.measure("stockage", readStorage)
    : await readStorage();

  if (error) throw new StockagesV2Error("STORAGE_READ_FAILED", 503, undefined, "resolveDestinationPaymentParcel");
  if (!parcel || parcel.delivery_status !== "AVAILABLE") {
    throw new StockagesV2Error("PARCEL_NOT_IN_AGENCY_STORAGE", 404, undefined, "resolveDestinationPaymentParcel");
  }

  const weightKg = Number(parcel.canonical_weight_kg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new StockagesV2Error("INVALID_CANONICAL_WEIGHT", 409, undefined, "resolveDestinationPaymentParcel");
  }

  const payments = await readAdminPayments(trace);
  const matching = payments.filter(
    (payment) =>
      normalizeTrackingCode(payment.codeColis) === code &&
      payment.destinationCode === agency
  );
  const amountExpected = money(weightKg * STANDARD_RATES_USD_PER_KG[agency]);
  const amountPaid = money(
    matching.reduce((total, payment) => total + payment.montantPaye, 0)
  );
  const remainingBalance = money(Math.max(0, amountExpected - amountPaid));

  return Object.freeze({
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
}, trace?: OperationPerformanceTrace) {
  const parcel = await resolveDestinationPaymentParcel(input.trackingCode, input.agency, trace);
  const validationStartedAt = performance.now();
  if (parcel.soldeRestant <= 0) throw new StockagesV2Error("PARCEL_ALREADY_PAID", 409, undefined, "recordDestinationPayment");
  validateUuid(input.paymentRequestId);
  const paymentMode = requiredPaymentMode(input.paymentMode);
  const operationContext = {
    type: "STORAGE_DESTINATION_PAYMENT",
    sourceDestinationCode: input.agency,
    collectionSiteCode: input.agency,
    canonicalWeightKg: parcel.poidsKg,
    canonicalExpectedAmount: parcel.montantAttendu,
    canonicalTotalPaid: parcel.montantDejaPaye
  } as const;
  const body = JSON.stringify({
    codeColis: parcel.codeColis,
    destinationCode: input.agency,
    montantPaye: parcel.soldeRestant,
    modePaiement: paymentMode,
    referencePaiement: clean(input.paymentReference),
    observation: clean(input.observation),
    paymentRequestId: input.paymentRequestId,
    operationContext
  });
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
    throw new StockagesV2Error(code, response.status || 503, undefined, "EDGE_FUNCTION", response.status || 503);
  }
  return payload;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  }).schema("public");
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
