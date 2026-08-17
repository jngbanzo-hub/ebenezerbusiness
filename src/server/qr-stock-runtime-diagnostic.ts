import "server-only";

import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

export async function readQrStockRuntimeDiagnostic(url: string, key: string, scope: "ADMIN" | "COO") {
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const count = async (status?: "UNASSIGNED" | "ASSIGNED" | "REVOKED") => {
    let query = client.schema("public").from("qr_labels").select("qr_id", { count: "exact", head: true });
    if (status) query = query.eq("status", status);
    const result = await query;
    if (result.error || result.count === null) throw new Error(result.error?.code ?? "COUNT_UNAVAILABLE");
    return result.count;
  };

  const direct = await Promise.all([count(), count("UNASSIGNED"), count("ASSIGNED"), count("REVOKED")])
    .then(([total, unassigned, assigned, revoked]) => ({ total, unassigned, assigned, revoked }))
    .catch((error: unknown) => ({ error: error instanceof Error ? error.message : "COUNT_UNAVAILABLE" }));
  const hostname = new URL(url).hostname;

  return {
    timestamp: new Date().toISOString(),
    scope,
    projectRef: hostname.split(".")[0] ?? "UNKNOWN",
    hostname,
    keyFingerprint: createHash("sha256").update(key).digest("hex").slice(0, 16),
    jwtRole: readJwtRole(key),
    direct,
  };
}

function readJwtRole(key: string): string {
  const payload = key.split(".")[1];
  if (!payload) return "NON_JWT";
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : "UNKNOWN";
  } catch {
    return "INVALID_JWT";
  }
}
