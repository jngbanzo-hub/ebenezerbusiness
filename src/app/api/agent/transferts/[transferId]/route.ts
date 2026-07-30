import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import {
  callTransfertsReadApi,
  TransfertsConfigurationError
} from "@/server/transferts-apps-script";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { transferId: string } }
) {
  try {
    const authorization = await authorizeAgentRequest(request);
    if (!authorization.authorized) {
      return privateJson(
        { state: "FORBIDDEN", message: authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit." },
        authorization.status
      );
    }
    const identity = authorization.identity;
    const transferId = decodeURIComponent(params.transferId || "").trim();
    if (!transferId || transferId.length > 100) {
      return privateJson({ state: "FORBIDDEN", message: "Transfer ID invalide." }, 400);
    }
    const transfer = await callTransfertsReadApi(
      "GET_TRANSFER",
      { userId: identity.userId, email: identity.email, role: "AGENT", agency: identity.site },
      { transferId }
    );
    return privateJson({ state: "READY", transfer });
  } catch (error) {
    return error instanceof TransfertsConfigurationError
      ? privateJson({ state: "NOT_CONFIGURED", message: "Le module Transferts n’est pas configuré." }, 503)
      : privateJson({ state: "SERVICE_UNAVAILABLE", message: "Le service Transferts est temporairement indisponible." }, 503);
  }
}

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
