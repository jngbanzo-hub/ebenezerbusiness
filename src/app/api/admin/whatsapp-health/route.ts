import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readWhatsappHealth } from "@/server/whatsapp-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) return json({ error: { code: authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" } }, authorization.status);
    return json(await readWhatsappHealth(), 200);
  } catch {
    return json({ status: "UNAVAILABLE", health: null }, 503);
  }
}

function json(body: unknown, status: number) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
