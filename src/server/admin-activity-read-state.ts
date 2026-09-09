import "server-only";
import { createClient } from "@supabase/supabase-js";

export type AdminActivityReadState = { activityId: string; readAt: string | null };
export const ADMIN_ACTIVITY_READ_STATE_BATCH_SIZE = 100;

export async function readAdminActivityReadStates(adminUserId: string, activeActivityIds: readonly string[]) {
  const ids = Array.from(new Set(activeActivityIds));
  if (!ids.length) return new Map<string, AdminActivityReadState>();
  const rows: unknown[] = [];
  for (let index = 0; index < ids.length; index += ADMIN_ACTIVITY_READ_STATE_BATCH_SIZE) {
    const batch = ids.slice(index, index + ADMIN_ACTIVITY_READ_STATE_BATCH_SIZE);
    const { data, error } = await client()
      .from("admin_activity_read_states")
      .select("activity_id,read_at")
      .eq("admin_user_id", adminUserId)
      .in("activity_id", batch);
    if (error || !Array.isArray(data)) {
      const diagnostic = error
        ? { code: error.code, message: error.message }
        : { code: "INVALID_RESPONSE", message: "Expected an array response." };
      console.error("[admin-activity-read-state]", diagnostic);
      throw new Error(`ADMIN_ACTIVITY_READ_STATE_UNAVAILABLE:${diagnostic.code}:${diagnostic.message}`);
    }
    rows.push(...data);
  }
  return new Map<string, AdminActivityReadState>(rows.map((row) => {
    const value = row as Record<string, unknown>;
    const state = { activityId: String(value.activity_id ?? ""), readAt: typeof value.read_at === "string" ? value.read_at : null };
    return [state.activityId, state];
  }));
}

export function onlyUnreadAdminActivities<T extends { read: boolean }>(activities: readonly T[]) {
  return activities.filter((activity) => !activity.read);
}

export async function markAdminActivitiesRead(adminUserId: string, activityIds: readonly string[] | null) {
  const ids = Array.from(new Set(activityIds ?? []));
  if (!ids.length) return 0;
  const readAt = new Date().toISOString();
  const { error } = await client().from("admin_activity_read_states").upsert(
    ids.map((activityId) => ({ admin_user_id: adminUserId, activity_id: activityId, read_at: readAt, is_active: true })),
    { onConflict: "admin_user_id,activity_id" }
  );
  if (error) throw new Error("ADMIN_ACTIVITY_READ_STATE_UNAVAILABLE");
  return ids.length;
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("SERVICE_UNAVAILABLE");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
