import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { resolveInterAgencyQuote } from "@/server/inter-agency-routing";
import { requireStorageAgency } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const url = new URL(request.url);
    const quote = await resolveInterAgencyQuote({ trackingCode: url.searchParams.get("trackingCode") ?? "", origin: requireStorageAgency(auth.identity.site), destination: requireStorageAgency(url.searchParams.get("destination") ?? "") });
    return NextResponse.json({ state: "SUCCESS", quote }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTER_AGENCY_QUOTE_FAILED";
    return fail(code, code === "PARCEL_NOT_FOUND" ? 404 : code.includes("WEIGHT") ? 422 : 400);
  }
}

function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: "L’acheminement ne peut pas être préparé." }, { status, headers: { "Cache-Control": "private, no-store" } }); }
