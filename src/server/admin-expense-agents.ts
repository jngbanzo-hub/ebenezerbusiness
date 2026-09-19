import "server-only";

import { createClient } from "@supabase/supabase-js";

export type ActiveExpenseAgent = Readonly<{
  id: string;
  name: string;
  agency: "COO" | "FIH" | "LSHI" | "KLZ";
}>;

export async function readActiveExpenseAgents(): Promise<ActiveExpenseAgent[]> {
  const client = serviceClient();
  const { data, error } = await client
    .from("agents")
    .select("id,nom,agence,role,actif")
    .eq("actif", true)
    .order("agence", { ascending: true })
    .order("nom", { ascending: true });

  if (error) throw new Error("ACTIVE_EXPENSE_AGENTS_UNAVAILABLE");

  return (data ?? []).flatMap((row) => {
    const id = text(row.id);
    const name = text(row.nom);
    const agency = normalizeAgency(row.agence);
    const role = text(row.role).toUpperCase();
    return id && name && agency && role === "AGENT" ? [{ id, name, agency }] : [];
  });
}

function normalizeAgency(value: unknown): ActiveExpenseAgent["agency"] | null {
  const normalized = text(value).toUpperCase();
  if (normalized === "COTONOU") return "COO";
  return ["COO", "FIH", "LSHI", "KLZ"].includes(normalized)
    ? normalized as ActiveExpenseAgent["agency"]
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("ACTIVE_EXPENSE_AGENTS_UNAVAILABLE");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  }).schema("public");
}
