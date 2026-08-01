import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";

export async function resolveParcelAction(trackingCode: string, agency: StorageAgency) {
  const code = normalizeCode(trackingCode);
  const [payments, parcelResult, deliveryResult] = await Promise.all([
    readAdminPayments(),
    serviceClient().from("stockage_parcels").select("delivery_status").eq("tracking_code", code).eq("agency", agency).maybeSingle(),
    serviceClient().from("stockage_events").select("event_id").eq("tracking_code", code).eq("agency", agency).eq("event_type", "CONFIRMED_DELIVERY_RECORDED").limit(1).maybeSingle()
  ]);
  if (parcelResult.error || deliveryResult.error) throw new StockagesV2Error("STORAGE_READ_FAILED", 503);
  const matching = payments.filter((payment) => normalizeCode(payment.codeColis) === code && payment.destinationCode === agency);
  const totalPaid = round(matching.reduce((sum, payment) => sum + payment.montantPaye, 0));
  const paymentSites = Array.from(new Set(matching.map((payment) => payment.agenceEncaissement)));
  return Object.freeze({
    totalPaid,
    paymentSites,
    physicallyPresent: parcelResult.data?.delivery_status === "AVAILABLE",
    delivered: Boolean(deliveryResult.data),
    fullyPaidAtCooOnly: paymentSites.length === 1 && paymentSites[0] === "COO"
  });
}

function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public"); }
function normalizeCode(value: unknown) { const code = String(value ?? "").trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code)) throw new StockagesV2Error("INVALID_TRACKING_CODE"); return code; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
