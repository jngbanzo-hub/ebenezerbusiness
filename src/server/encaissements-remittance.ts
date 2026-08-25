import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readAdminPayments } from "@/server/admin-payments-sheets";
import { StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";

export async function resolvePaidPhysicalParcel(trackingCode: string, agency: StorageAgency) {
  const code = normalizeCode(trackingCode);
  const [{ data: parcel, error }, payments] = await Promise.all([
    serviceClient().from("stockage_parcels").select("tracking_code,agency,canonical_weight_kg,weight_source_reference,delivery_status").eq("tracking_code", code).eq("agency", agency).maybeSingle(),
    readAdminPayments()
  ]);
  if (error) throw new StockagesV2Error("STORAGE_READ_FAILED", 503, undefined, "resolvePaidPhysicalParcel");
  if (!parcel || parcel.delivery_status !== "AVAILABLE") throw new StockagesV2Error("PARCEL_NOT_PHYSICALLY_AVAILABLE", 409, undefined, "resolvePaidPhysicalParcel");
  const matching = payments.filter((payment) => normalizeCode(payment.codeColis) === code && payment.destinationCode === agency);
  const expected = Array.from(new Set(matching.map((payment) => payment.montantAttendu).filter((value): value is number => value !== null).map((value) => value.toFixed(2))));
  const totalPaid = round(matching.reduce((sum, payment) => sum + payment.montantPaye, 0));
  if (expected.length !== 1 || totalPaid !== Number(expected[0])) throw new StockagesV2Error("PAYMENT_NOT_COMPLETE", 409, undefined, "resolvePaidPhysicalParcel");
  return {
    trackingCode: code,
    weightKg: Number(parcel.canonical_weight_kg),
    weightSourceReference: String(parcel.weight_source_reference),
    paymentSnapshot: { checked: true, totalPaid, references: matching.map((payment) => payment.reference || payment.id) }
  };
}

function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public"); }
function normalizeCode(value: unknown) { const code = String(value ?? "").trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code)) throw new StockagesV2Error("INVALID_TRACKING_CODE"); return code; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
