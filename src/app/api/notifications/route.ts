import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { listInternalNotifications, markInternalNotificationsRead, type NotificationAgency } from "@/server/internal-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const scope = await authorize(request); if (!scope) return fail(403);
    return NextResponse.json(await listInternalNotifications(scope, new URL(request.url).searchParams.get("filter") === "unread"), { headers: noStore });
  } catch { return fail(503); }
}

export async function POST(request: Request) {
  try {
    const scope = await authorize(request); if (!scope) return fail(403);
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "MARK_READ" && body.action !== "MARK_ALL_READ") return fail(400);
    await markInternalNotificationsRead(scope, body.action === "MARK_READ" && typeof body.notificationId === "string" ? body.notificationId : undefined);
    return NextResponse.json({ success: true }, { headers: noStore });
  } catch { return fail(503); }
}

async function authorize(request: Request) {
  const admin = await authorizeAdminRequest(request); if (admin.authorized) return { userId: admin.userId, role: "ADMIN" as const, agency: admin.agency };
  const agent = await authorizeAgentRequest(request); if (!agent.authorized) return null;
  return { userId: agent.identity.userId, role: "AGENT" as const, agency: agent.identity.site as NotificationAgency };
}
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
function fail(status: number) { return NextResponse.json({ message: status === 400 ? "Commande invalide." : "Notifications indisponibles." }, { status, headers: noStore }); }
