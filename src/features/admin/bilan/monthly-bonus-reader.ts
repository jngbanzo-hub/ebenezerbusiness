import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { MonthlyAgentBonus } from "./monthly-bonus-aggregations";

export async function readMonthlyAgentBonuses(monthOrigin: string): Promise<readonly MonthlyAgentBonus[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("BILAN_BONUS_SOURCE_UNAVAILABLE");
  const { data, error } = await createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: noStoreFetch } })
    .schema("public")
    .from("bilan_monthly_agent_bonuses")
    .select("id,month_origin,beneficiary_id,agency,amount_usd,status,decided_at,decided_by,note,created_at,updated_at,bilan_bonus_beneficiaries!inner(display_name,auth_agent_id)")
    .eq("month_origin", `${monthOrigin}-01`)
    .order("agency")
    .order("beneficiary_id");
  if (error) throw new Error("BILAN_BONUS_SOURCE_UNAVAILABLE");
  return Object.freeze((data ?? []).map((row) => Object.freeze({
    id: String(row.id), monthOrigin, agentId: String(row.beneficiary_id), agentName: beneficiary(row.bilan_bonus_beneficiaries).displayName,
    agency: row.agency as MonthlyAgentBonus["agency"], amountUsd: row.amount_usd === null ? null : Number(row.amount_usd),
    status: row.status as MonthlyAgentBonus["status"], decidedAt: row.decided_at, decidedBy: row.decided_by,
    note: row.note, createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  })));
}

function beneficiary(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return { displayName: "Bénéficiaire Prime" };
  const displayName = "display_name" in row && typeof row.display_name === "string" ? row.display_name : "Bénéficiaire Prime";
  return { displayName };
}

function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: "no-store" });
}
