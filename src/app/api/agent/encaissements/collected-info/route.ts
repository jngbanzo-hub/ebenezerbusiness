import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { readCollectedPaymentInfo } from "@/server/agent-collected-payment-info";
import { requireStorageAgency } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorizeAgentRequest(request);
  if (!auth.authorized) return NextResponse.json({ state: "UNAVAILABLE" }, { status: auth.status });
  try {
    const agency = requireStorageAgency(auth.identity.site);
    const params = new URL(request.url).searchParams;
    const info = await readCollectedPaymentInfo(params.get("trackingCode") ?? "", agency, params.get("parcelId") ?? undefined);
    return NextResponse.json(info, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ state: "UNAVAILABLE" }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
