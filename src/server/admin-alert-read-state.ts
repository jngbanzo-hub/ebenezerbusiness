import "server-only";

import { createClient } from "@supabase/supabase-js";

export type AdminAlertReadState = {
  alertId: string;
  occurrence: number;
  readAt: string | null;
};

export async function syncAdminAlertReadStates(
  adminUserId: string,
  activeAlertIds: readonly string[]
): Promise<Map<string, AdminAlertReadState>> {
  const { data, error } = await client().rpc("sync_admin_alert_read_states_server", {
    p_admin_user_id: adminUserId,
    p_active_alert_ids: Array.from(new Set(activeAlertIds))
  });

  if (error || !Array.isArray(data)) {
    throw new Error("ADMIN_ALERT_READ_STATE_UNAVAILABLE");
  }

  return new Map(
    data.map((row) => {
      const value = row as Record<string, unknown>;
      const state: AdminAlertReadState = {
        alertId: String(value.alert_id ?? ""),
        occurrence: Number(value.occurrence ?? 1),
        readAt: typeof value.read_at === "string" ? value.read_at : null
      };
      return [state.alertId, state];
    })
  );
}

export async function markAdminAlertsRead(
  adminUserId: string,
  alertIds: readonly string[] | null
): Promise<number> {
  const { data, error } = await client().rpc("mark_admin_alerts_read_server", {
    p_admin_user_id: adminUserId,
    p_alert_ids: alertIds ? Array.from(new Set(alertIds)) : null
  });

  if (error || !Number.isInteger(Number(data))) {
    throw new Error("ADMIN_ALERT_READ_STATE_UNAVAILABLE");
  }

  return Number(data);
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
