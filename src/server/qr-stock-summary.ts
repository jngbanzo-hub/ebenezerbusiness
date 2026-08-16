import "server-only";

import { createClient } from "@supabase/supabase-js";

export type QrStockSummary = { total: number; unassigned: number; assigned: number; revoked: number };

export async function readQrStockSummary(): Promise<QrStockSummary> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("QR_SERVICE_UNAVAILABLE");
  const { data, error } = await createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    .schema("public")
    .rpc("read_qr_stock_summary_server");
  if (error || !isSummary(data)) throw new Error("QR_SERVICE_UNAVAILABLE");
  return data;
}

function isSummary(value: unknown): value is QrStockSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ["total", "unassigned", "assigned", "revoked"].every((key) => Number.isInteger(item[key]) && Number(item[key]) >= 0)
    && Number(item.total) === Number(item.unassigned) + Number(item.assigned) + Number(item.revoked);
}
