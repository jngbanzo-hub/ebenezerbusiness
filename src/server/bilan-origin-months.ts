import "server-only";
import { createClient } from "@supabase/supabase-js";
import { validateCohortDefinitions, type OriginMonth } from "@/features/admin/bilan/cohort-catalog";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("BILAN_REGISTRY_UNAVAILABLE");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } }).schema("public");
}

export async function readBilanOriginMonths(): Promise<readonly OriginMonth[]> {
  const db = client(); const rows: OriginMonth[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await db.from("bilan_origin_months")
      .select("id,prefix,year,month,label,active,created_at,updated_at").order("year").order("month").range(offset, offset + 499);
    if (error || !data) throw new Error("BILAN_REGISTRY_UNAVAILABLE");
    for (const row of data) {
      if (typeof row.id !== "string" || typeof row.active !== "boolean" || typeof row.prefix !== "string" || typeof row.label !== "string") throw new Error("BILAN_REGISTRY_INVALID");
      rows.push(Object.freeze({ registryId: row.id, id: `${row.year}-${String(row.month).padStart(2, "0")}`,
        prefix: row.prefix, year: row.year, month: row.month, label: row.label, active: row.active, createdAt: row.created_at, updatedAt: row.updated_at }));
    }
    if (data.length < 500) { validateCohortDefinitions(rows); return Object.freeze(rows); }
  }
  throw new Error("BILAN_REGISTRY_INCOMPLETE");
}

export async function createBilanOriginMonth(input: { prefix: string; year: number; month: number; label: string }, actorId: string) {
  const { error } = await client().rpc("bilan_origin_month_create", { p_prefix: input.prefix, p_year: input.year, p_month: input.month, p_label: input.label, p_actor: actorId });
  if (error) throw registryError(error);
}

export async function updateBilanOriginMonth(input: { id: string; label: string; active: boolean }, actorId: string) {
  const { error } = await client().rpc("bilan_origin_month_update", { p_id: input.id, p_label: input.label, p_active: input.active, p_actor: actorId });
  if (error) throw registryError(error);
}

function registryError(error: { code?: string; message: string }) {
  if (error.code === "23505" || error.message.includes("ORIGIN_MONTH_PREFIX_CONFLICT")) return new Error("ORIGIN_MONTH_CONFLICT");
  if (error.message.includes("ORIGIN_MONTH_NOT_FOUND")) return new Error("ORIGIN_MONTH_NOT_FOUND");
  return new Error("BILAN_REGISTRY_UNAVAILABLE");
}
