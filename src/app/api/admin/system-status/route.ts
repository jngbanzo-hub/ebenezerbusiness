import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminSystemStatus } from "@/server/admin-system-status";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(request: Request) { try { const auth = await authorizeAdminRequest(request); if (!auth.authorized) return NextResponse.json({ message: "Accès refusé." }, { status: auth.status }); return NextResponse.json(await readAdminSystemStatus(), { headers: { "Cache-Control": "private, no-store" } }); } catch { return NextResponse.json({ message: "État du système indisponible." }, { status: 503 }); } }
