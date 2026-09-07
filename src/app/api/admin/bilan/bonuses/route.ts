import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readMonthlyBonusAdmin, saveMonthlyBonusAdmin } from "@/server/bilan-monthly-bonus-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const month = /^\d{4}-(0[1-9]|1[0-2])$/;
const schema = z.object({ monthOrigin: z.string().regex(month), certify: z.boolean(), decisions: z.array(z.object({ beneficiaryId: z.string().uuid(), amountUsd: z.number().min(0).max(100000).nullable(), note: z.string().max(500).optional() })).min(1).max(200) });

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request); if (!auth.authorized) return fail(auth.status);
  const monthOrigin = new URL(request.url).searchParams.get("monthOrigin") ?? "";
  if (!month.test(monthOrigin)) return NextResponse.json({ code: "INVALID_MONTH" }, { status: 400, headers: noStore() });
  try { return NextResponse.json(await readMonthlyBonusAdmin(monthOrigin), { headers: noStore() }); } catch { return NextResponse.json({ code: "BONUS_SOURCE_UNAVAILABLE" }, { status: 503, headers: noStore() }); }
}

export async function PUT(request: Request) {
  const auth = await authorizeAdminRequest(request); if (!auth.authorized) return fail(auth.status);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_BONUS_DECISION" }, { status: 400, headers: noStore() });
  try { return NextResponse.json(await saveMonthlyBonusAdmin({ ...parsed.data, actorId: auth.userId }), { headers: noStore() }); } catch (cause) { const code = cause instanceof Error ? cause.message : "BONUS_SAVE_FAILED"; return NextResponse.json({ code }, { status: code === "BILAN_BONUS_INCOMPLETE" ? 409 : 503, headers: noStore() }); }
}
function fail(status: 401 | 403) { return NextResponse.json({ code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" }, { status, headers: noStore() }); }
function noStore() { return { "Cache-Control": "private, no-store, max-age=0" }; }
