import "server-only";
import { createClient } from "@supabase/supabase-js";

export async function readMonthlyBonusAdmin(monthOrigin: string) {
  const client = serviceClient();
  const [{ data: beneficiaries, error: beneficiaryError }, { data: decisions, error: decisionError }] = await Promise.all([
    client.from("bilan_bonus_beneficiaries").select("beneficiary_id,display_name,agency,active,auth_agent_id").eq("active", true).order("agency").order("display_name"),
    client.from("bilan_monthly_agent_bonuses").select("id,beneficiary_id,amount_usd,status,note").eq("month_origin", `${monthOrigin}-01`)
  ]);
  if (beneficiaryError || decisionError) throw new Error("BILAN_BONUS_SOURCE_UNAVAILABLE");
  return { beneficiaries: beneficiaries ?? [], decisions: decisions ?? [] };
}

export async function saveMonthlyBonusAdmin(input: Readonly<{ monthOrigin: string; actorId: string; certify: boolean; decisions: readonly { beneficiaryId: string; amountUsd: number | null; note?: string }[] }>) {
  const client = serviceClient();
  const status = input.certify ? "CERTIFIEE" : "A_DEFINIR";
  const rows = input.decisions.map((item) => ({ month_origin: `${input.monthOrigin}-01`, beneficiary_id: item.beneficiaryId, amount_usd: input.certify ? item.amountUsd : null, status, decided_at: input.certify ? new Date().toISOString() : null, decided_by: input.certify ? input.actorId : null, note: item.note?.trim() || null, updated_at: new Date().toISOString() }));
  if (input.certify && rows.some((row) => row.amount_usd === null || row.amount_usd < 0)) throw new Error("BILAN_BONUS_INCOMPLETE");
  const { error } = await client.from("bilan_monthly_agent_bonuses").upsert(rows, { onConflict: "month_origin,beneficiary_id" });
  if (error) throw new Error("BILAN_BONUS_SAVE_FAILED");
  return readMonthlyBonusAdmin(input.monthOrigin);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("BILAN_BONUS_SOURCE_UNAVAILABLE");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
