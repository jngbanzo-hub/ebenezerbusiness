import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const dailyReportNoteSchema = z.object({
  agency: z.enum(["FIH", "LSHI", "KLZ"]),
  from: z.string().date(),
  to: z.string().date(),
  content: z.string().trim().min(3).max(1000),
  visibleToAgents: z.boolean(),
  confirmationFinal: z.literal(true)
}).strict().refine((row) => row.from <= row.to, "INVALID_REPORT_PERIOD");

export async function addDailyReportNote(raw: unknown, admin: { userId: string; name: string }) {
  const command = dailyReportNoteSchema.parse(raw);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("REPORT_NOTE_UNAVAILABLE");
  const requestId = randomUUID();
  const auditId = `daily-report-note-${requestId}`;
  const { error } = await createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    .schema("public").from("cash_admin_audit").insert({
      audit_id: auditId,
      agency: command.agency,
      action: "DAILY_REPORT_NOTE",
      target_type: "DAILY_REPORT",
      target_id: `${command.agency}:${command.from}:${command.to}`,
      previous_value: null,
      new_value: { content: command.content },
      reason: "Note administrative du rapport",
      admin_user_id: admin.userId,
      admin_name_snapshot: admin.name,
      occurred_at: new Date().toISOString(),
      request_id: requestId,
      metadata: { from: command.from, to: command.to, visibleToAgents: command.visibleToAgents }
    });
  if (error) throw new Error("REPORT_NOTE_UNAVAILABLE");
  return Object.freeze({ auditId, agency: command.agency, content: command.content, visibleToAgents: command.visibleToAgents });
}
