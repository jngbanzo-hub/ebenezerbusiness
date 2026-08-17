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

export async function readRecentInitialQrAssignments(limit = 50): Promise<QrAssignmentHistoryItem[]> {
  const client = serviceClient();
  const { data: audits, error: auditError } = await client
    .from("qr_audit_events")
    .select("event_id,qr_id,new_agency,new_tracking_code,actor_id,actor_role,occurred_at")
    .eq("action", "INITIAL_ASSIGNMENT")
    .eq("actor_agency", "COO")
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (auditError) throw new Error("QR_HISTORY_UNAVAILABLE");
  if (!audits?.length) return [];

  const qrIds = Array.from(new Set(audits.map((row) => String(row.qr_id))));
  const actorIds = Array.from(new Set(audits.map((row) => String(row.actor_id))));
  const [{ data: labels, error: labelError }, { data: agents, error: agentError }] = await Promise.all([
    client.from("qr_labels").select("qr_id,display_number,status,agency,tracking_code").in("qr_id", qrIds),
    client.from("agents").select("id,nom").in("id", actorIds)
  ]);
  if (labelError || agentError) throw new Error("QR_HISTORY_UNAVAILABLE");

  const labelById = new Map((labels ?? []).map((row) => [String(row.qr_id), row]));
  const actorById = new Map((agents ?? []).map((row) => [String(row.id), String(row.nom ?? "").trim() || null]));
  return audits.flatMap((audit) => {
    const qrId = String(audit.qr_id);
    const label = labelById.get(qrId);
    if (!label) return [];
    return [{
      eventId: String(audit.event_id),
      qrId,
      displayNumber: Number(label.display_number),
      agency: String(audit.new_agency ?? label.agency ?? ""),
      trackingCode: String(audit.new_tracking_code ?? label.tracking_code ?? ""),
      assignedAt: String(audit.occurred_at),
      actorId: String(audit.actor_id),
      actorName: actorById.get(String(audit.actor_id)) ?? null,
      actorRole: String(audit.actor_role),
      status: String(label.status) as QrAssignmentHistoryItem["status"]
    }];
  });
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("QR_SERVICE_UNAVAILABLE");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
