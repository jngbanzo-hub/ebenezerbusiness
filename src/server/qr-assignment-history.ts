import "server-only";

import { createClient } from "@supabase/supabase-js";

export type QrAssignmentHistoryItem = {
  eventId: string;
  qrId: string;
  displayNumber: number;
  agency: string;
  trackingCode: string;
  assignedAt: string;
  actorId: string;
  actorName: string | null;
  actorRole: string;
  status: "UNASSIGNED" | "ASSIGNED" | "REVOKED";
};

export async function readRecentInitialQrAssignments(
  accessToken: string,
  limit = 50
): Promise<QrAssignmentHistoryItem[]> {
  const client = authenticatedClient(accessToken);
  const { data, error } = await client.rpc("read_qr_assignment_history_server", {
    p_limit: Math.min(Math.max(limit, 1), 100)
  });
  if (error || !Array.isArray(data)) throw new Error("QR_HISTORY_UNAVAILABLE");
  return data.map((item: Record<string, unknown>) => ({
    eventId: String(item.eventId),
    qrId: String(item.qrId),
    displayNumber: Number(item.displayNumber),
    agency: String(item.agency ?? ""),
    trackingCode: String(item.trackingCode ?? ""),
    assignedAt: String(item.assignedAt),
    actorId: String(item.actorId),
    actorName: typeof item.actorName === "string" ? item.actorName : null,
    actorRole: String(item.actorRole),
    status: String(item.status) as QrAssignmentHistoryItem["status"]
  }));
}

function authenticatedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !accessToken) throw new Error("QR_SERVICE_UNAVAILABLE");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  }).schema("public");
}
