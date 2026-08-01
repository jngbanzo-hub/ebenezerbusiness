import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { createInterAgencyForwarding } from "@/server/stockages-forwarding";
import { requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = new Set(["trackingCode", "destination", "amountPaid", "paymentMode", "paymentReference", "observation", "requestId", "confirmed"]);

export async function POST(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const body = await request.json() as Record<string, unknown>;
    if (body.confirmed !== true || Object.keys(body).some((key) => !ALLOWED.has(key))) return fail("INVALID_FORWARDING_COMMAND", 400);
    const result = await createInterAgencyForwarding({
      trackingCode: String(body.trackingCode ?? ""),
      origin: requireStorageAgency(auth.identity.site),
      destination: requireStorageAgency(String(body.destination ?? "")),
      amountPaid: Number(body.amountPaid),
      paymentMode: String(body.paymentMode ?? ""),
      paymentReference: String(body.paymentReference ?? ""),
      observation: String(body.observation ?? ""),
      requestId: String(body.requestId ?? ""),
      actorId: auth.identity.userId
    });
    return NextResponse.json({ state: "SUCCESS", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (cause) { return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("FORWARDING_SERVICE_UNAVAILABLE", 503); }
}

function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: message(code) }, { status, headers: { "Cache-Control": "private, no-store" } }); }
function message(code: string) { if (code === "FORWARDING_ALREADY_EXISTS") return "Cet acheminement existe déjà."; if (code === "IDEMPOTENCY_CONFLICT") return "Cette demande correspond à une autre opération."; if (code === "STORAGE_ACCOUNT_NOT_ACTIVE") return "Le Stockage commun de l’agence n’est pas encore ouvert."; return "L’acheminement inter-agences a été refusé."; }
