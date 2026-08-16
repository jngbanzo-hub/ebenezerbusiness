import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { normalizeGlobalParcelCode, searchAdminParcelGlobally } from "@/server/admin-global-parcel-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const code = normalizeGlobalParcelCode(new URL(request.url).searchParams.get("code"));
    if (!code) return fail("INVALID_TRACKING_CODE", 400);
    return NextResponse.json(await searchAdminParcelGlobally(auth.userId, code), { headers: noStore() });
  } catch {
    return fail("GLOBAL_SEARCH_UNAVAILABLE", 503);
  }
}

function fail(code: string, status: number) { return NextResponse.json({ code }, { status, headers: noStore() }); }
function noStore() { return { "Cache-Control": "private, no-store, max-age=0" }; }
