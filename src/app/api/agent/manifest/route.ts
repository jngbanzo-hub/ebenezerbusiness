import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { readAgentManifest, type AgentManifestAgency } from "@/server/agent-manifest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorizeAgentRequest(request);
  if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
  const viewerAgency = auth.identity.site as AgentManifestAgency;
  if (!["COO", "FIH", "LSHI", "KLZ"].includes(viewerAgency)) return fail("ACCESS_DENIED", 403);
  try {
    const params = new URL(request.url).searchParams;
    const cooModule = params.get("view") === "coo";
    if (cooModule && viewerAgency !== "COO") return fail("ACCESS_DENIED", 403);
    const requestedAgency = (params.get("agency") ?? "").trim().toUpperCase();
    const agency = viewerAgency === "COO"
      ? (["FIH", "LSHI", "KLZ"].includes(requestedAgency) ? requestedAgency : "FIH") as AgentManifestAgency
      : viewerAgency;
    const result = await readAgentManifest({
      agency,
      compareStorage: viewerAgency !== "COO",
      code: params.get("code") ?? "",
      status: params.get("status") ?? "",
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 25)
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return fail("MANIFEST_READ_FAILED", 503);
  }
}

function fail(code: string, status: number) {
  return NextResponse.json({ code, message: "Lecture du Manifeste indisponible." }, { status, headers: { "Cache-Control": "private, no-store" } });
}
