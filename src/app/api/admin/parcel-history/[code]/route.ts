import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { normalizeGlobalParcelCode } from "@/server/admin-global-parcel-search";
import { readAdminParcelHistory } from "@/server/admin-parcel-history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { code: string } }) {
  try {
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const code = normalizeGlobalParcelCode(decodeURIComponent(params.code));
    if (!code) return fail("INVALID_TRACKING_CODE", 400);
    return NextResponse.json(await readAdminParcelHistory(auth.userId, code), { headers: noStore() });
  } catch { return fail("PARCEL_HISTORY_UNAVAILABLE", 503); }
}
function fail(code: string, status: number) { return NextResponse.json({ code }, { status, headers: noStore() }); }
function noStore() { return { "Cache-Control": "private, no-store, max-age=0" }; }
