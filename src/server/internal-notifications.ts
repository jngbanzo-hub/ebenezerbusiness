import "server-only";

import { createClient } from "@supabase/supabase-js";

export type NotificationAgency = "COO" | "FIH" | "LSHI" | "KLZ";
export type NotificationType = "PAYMENT" | "EXPENSE" | "STORAGE_ARRIVAL" | "STORAGE_EXIT" | "CASH";

type Scope = { userId: string; role: "AGENT" | "ADMIN"; agency: NotificationAgency | null };

export async function recordInternalNotification(input: { eventKey: string; agency: NotificationAgency; type: NotificationType; title: string; message: string; actorUserId: string; actorName: string }) {
  const { error } = await client().from("internal_notifications").upsert({
    event_key: input.eventKey, agency: input.agency, type: input.type, title: input.title.slice(0, 160),
    message: input.message.slice(0, 500), actor_user_id: input.actorUserId, actor_name: input.actorName.slice(0, 160)
  }, { onConflict: "event_key", ignoreDuplicates: true });
  if (error) throw new Error("NOTIFICATION_WRITE_FAILED");
}

export async function listInternalNotifications(scope: Scope, unreadOnly: boolean) {
  let query = client().from("internal_notifications").select("id,type,title,message,agency,actor_name,occurred_at").order("occurred_at", { ascending: false }).limit(100);
  if (scope.role === "AGENT") query = query.eq("agency", requiredAgency(scope.agency));
  const [{ data, error }, reads] = await Promise.all([query, client().from("internal_notification_reads").select("notification_id").eq("user_id", scope.userId)]);
  if (error || reads.error) throw new Error("NOTIFICATION_READ_FAILED");
  const readIds = new Set((reads.data ?? []).map((row) => row.notification_id));
  const notifications = (data ?? []).map((row) => ({ id: row.id, type: row.type, title: row.title, message: row.message, agency: row.agency, actorName: row.actor_name, occurredAt: row.occurred_at, read: readIds.has(row.id) }));
  return { notifications: unreadOnly ? notifications.filter((row) => !row.read) : notifications, unreadCount: notifications.filter((row) => !row.read).length };
}

export async function markInternalNotificationsRead(scope: Scope, notificationId?: string) {
  const current = await listInternalNotifications(scope, false);
  const ids = notificationId ? current.notifications.filter((row) => row.id === notificationId).map((row) => row.id) : current.notifications.filter((row) => !row.read).map((row) => row.id);
  if (notificationId && ids.length !== 1) throw new Error("NOTIFICATION_NOT_FOUND");
  if (!ids.length) return;
  const { error } = await client().from("internal_notification_reads").upsert(ids.map((id) => ({ notification_id: id, user_id: scope.userId })), { onConflict: "notification_id,user_id", ignoreDuplicates: true });
  if (error) throw new Error("NOTIFICATION_READ_WRITE_FAILED");
}

function requiredAgency(value: NotificationAgency | null) { if (!value) throw new Error("AGENCY_REQUIRED"); return value; }
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NOTIFICATION_SOURCE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
