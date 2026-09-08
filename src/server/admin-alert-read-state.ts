import "server-only";

import { createClient } from "@supabase/supabase-js";

export type AdminAlertReadState = {
  alertId: string;
  occurrence: number;
  readAt: string | null;
};

export async function readAdminAlertReadStates(
  adminUserId: string,
  activeAlertIds: readonly string[]
): Promise<Map<string, AdminAlertReadState>> {
  const ids = Array.from(new Set(activeAlertIds));
  if (!ids.length) return new Map();
  const { data, error } = await client()
    .from("admin_alert_read_states")
    .select("alert_id,occurrence,read_at,is_active")
    .eq("admin_user_id", adminUserId)
    .in("alert_id", ids);

  if (error || !Array.isArray(data)) {
    throw new Error("ADMIN_ALERT_READ_STATE_UNAVAILABLE");
  }

  return new Map(
    data.map((row) => {
      const value = row as Record<string, unknown>;
      const state: AdminAlertReadState = {
        alertId: String(value.alert_id ?? ""),
        occurrence: Number(value.occurrence ?? 1) + (value.is_active === false ? 1 : 0),
        readAt: value.is_active === false ? null : typeof value.read_at === "string" ? value.read_at : null
      };
      return [state.alertId, state];
    })
  );
}

export async function markAdminAlertsRead(
  adminUserId: string,
  alerts: readonly { alertId: string; occurrence: number }[]
): Promise<number> {
  const unique = Array.from(new Map(alerts.map((alert) => [alert.alertId, alert])).values());
  if (!unique.length) return 0;
  const readAt = new Date().toISOString();
  const { error } = await client().from("admin_alert_read_states").upsert(
    unique.map(({ alertId, occurrence }) => ({
      admin_user_id: adminUserId,
      alert_id: alertId,
      occurrence,
      read_at: readAt,
      is_active: true,
      last_seen_at: readAt
    })),
    { onConflict: "admin_user_id,alert_id" }
  );
  if (error) {
    throw new Error("ADMIN_ALERT_READ_STATE_UNAVAILABLE");
  }
  return unique.length;
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SERVICE_UNAVAILABLE");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  }).schema("public");
}
