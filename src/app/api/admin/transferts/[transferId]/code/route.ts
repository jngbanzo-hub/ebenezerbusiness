import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import {
  callTransfertsReadApi,
  TransfertsConfigurationError,
  TransfertsServiceError
} from "@/server/transferts-apps-script";
import { getTransfertsFeatureFlags } from "@/server/transferts-feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { transferId: string } }
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) {
      return privateJson(
        { state: "FORBIDDEN", message: authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit." },
        authorization.status
      );
    }
    if (!authorization.agency) {
      return privateJson({ state: "NOT_CONFIGURED", message: "Agence de traçabilité Admin invalide." }, 503);
    }
    if (!getTransfertsFeatureFlags().adminEnabled) {
      return privateJson({ state: "FORBIDDEN", message: "Accès Admin désactivé." }, 403);
    }
    const transferId = decodeURIComponent(params.transferId || "").trim();
    if (!transferId || transferId.length > 100) {
      return privateJson({ state: "FORBIDDEN", message: "Transfer ID invalide." }, 400);
    }
    const transfer = await callTransfertsReadApi(
      "GET_TRANSFER",
      { userId: authorization.userId, email: authorization.email, role: "ADMIN", agency: authorization.agency },
      { transferId },
      { allowAdminDetailCode: true }
    ) as { transferCode?: unknown };
    if (typeof transfer.transferCode !== "string" || !transfer.transferCode.trim()) {
      throw new TransfertsServiceError("TRANSFER_CODE_UNAVAILABLE");
    }
    return privateJson({ state: "READY", transferCode: transfer.transferCode });
  } catch (error) {
    return error instanceof TransfertsConfigurationError
      ? privateJson({ state: "NOT_CONFIGURED", message: "Le module Transferts n’est pas configuré." }, 503)
      : privateJson({ state: "SERVICE_UNAVAILABLE", message: "Le code de transfert est temporairement indisponible." }, 503);
  }
}

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
