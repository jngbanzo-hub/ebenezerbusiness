import "server-only";

import { createClient } from "@supabase/supabase-js";

export type QrStockSummary = { total: number; unassigned: number; assigned: number; revoked: number };

export async function readQrStockSummary(): Promise<QrStockSummary> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("QR_SERVICE_UNAVAILABLE");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
  const [totalResult, unassignedResult, assignedResult, revokedResult] = await Promise.all([
    client.from("qr_labels").select("qr_id", { count: "exact", head: true }),
    client.from("qr_labels").select("qr_id", { count: "exact", head: true }).eq("status", "UNASSIGNED"),
    client.from("qr_labels").select("qr_id", { count: "exact", head: true }).eq("status", "ASSIGNED"),
    client.from("qr_labels").select("qr_id", { count: "exact", head: true }).eq("status", "REVOKED")
  ]);
  const results = [totalResult, unassignedResult, assignedResult, revokedResult];
  if (results.some(({ count, error }) => error || count === null)) throw new Error("QR_SERVICE_UNAVAILABLE");
  return {
    total: totalResult.count ?? 0,
    unassigned: unassignedResult.count ?? 0,
    assigned: assignedResult.count ?? 0,
    revoked: revokedResult.count ?? 0
  };
}
