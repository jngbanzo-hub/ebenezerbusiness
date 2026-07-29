import { NextResponse } from "next/server";

import type { TransferSummary, TransfersPageResponse } from "@/features/transferts/types";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import {
  callTransfertsReadApi,
  TransfertsConfigurationError
} from "@/server/transferts-apps-script";
import {
  assertTransfertsReadOnlyMode,
  getTransfertsFeatureFlags
} from "@/server/transferts-feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertTransfertsReadOnlyMode();
    const authorization = await authorizeAgentRequest(request);
    if (!authorization.authorized) {
      return errorResponse(
        authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit.",
        authorization.status,
        "FORBIDDEN"
      );
    }
    const identity = authorization.identity;
    const data = await callTransfertsReadApi(
      "LIST_AGENCY_TRANSFERS",
      {
        userId: identity.userId,
        email: identity.email,
        role: identity.role,
        agency: identity.site
      },
      { agency: identity.site }
    );
    const transfers = Array.isArray(data) ? (data as TransferSummary[]) : [];
    const flags = getTransfertsFeatureFlags();
    const body: TransfersPageResponse = {
      state: transfers.length ? "READY" : "EMPTY",
      moduleStatus: "PREPARATION",
      role: "AGENT",
      agency: identity.site,
      apiAvailable: true,
      writesEnabled: false,
      adminEnabled: false,
      transfers,
      message: transfers.length
        ? "Transferts liés à votre agence."
        : "Aucun transfert n’est disponible pour votre agence."
    };
    return privateJson(body);
  } catch (error) {
    return error instanceof TransfertsConfigurationError
      ? errorResponse("Le module Transferts n’est pas configuré.", 503, "NOT_CONFIGURED")
      : errorResponse("Le service Transferts est temporairement indisponible.", 503, "SERVICE_UNAVAILABLE");
  }
}

function errorResponse(message: string, status: number, state: string) {
  return privateJson({ state, message }, status);
}
function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
