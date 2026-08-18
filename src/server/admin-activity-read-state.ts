import "server-only";
import { createClient } from "@supabase/supabase-js";

export type AdminActivityReadState = { activityId: string; readAt: string | null };

export async function syncAdminActivityReadStates(adminUserId: string, activeActivityIds: readonly string[]) {
  const { data, error } = await client().rpc("sync_admin_activity_read_states_server", {
    p_admin_user_id: adminUserId,
    p_active_activity_ids: Array.from(new Set(activeActivityIds))
  });
  if (error || !Array.isArray(data)) throw new Error("ADMIN_ACTIVITY_READ_STATE_UNAVAILABLE");
  return new Map<string, AdminActivityReadState>(data.map((row) => {
    const value = row as Record<string, unknown>;
    const state = { activityId: String(value.activity_id ?? ""), readAt: typeof value.read_at === "string" ? value.read_at : null };
    return [state.activityId, state];
  }));
}

export async function markAdminActivitiesRead(adminUserId: string, activityIds: readonly string[] | null) {
  const { data, error } = await client().rpc("mark_admin_activities_read_server", {
    p_admin_user_id: adminUserId,
    p_activity_ids: activityIds ? Array.from(new Set(activityIds)) : null
  });
  if (error || !Number.isInteger(Number(data))) throw new Error("ADMIN_ACTIVITY_READ_STATE_UNAVAILABLE");
  return Number(data);
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("SERVICE_UNAVAILABLE");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
