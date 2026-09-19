import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { callTransfertsReadApi, TransfertsConfigurationError } from "@/server/transferts-apps-script";
import { assertTransfertsReadOnlyMode, getTransfertsFeatureFlags } from "@/server/transferts-feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { transferId: string } }) {
  try {
    assertTransfertsReadOnlyMode();
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) {
      return privateJson({ state: "FORBIDDEN", message: authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit." }, authorization.status);
    }
    if (!authorization.agency) return privateJson({ state: "NOT_CONFIGURED", message: "Le profil administrateur ne possède pas encore une agence de traçabilité valide." }, 503);
    if (!getTransfertsFeatureFlags().adminEnabled) {
      return privateJson({ state: "PREPARATION", message: "La consultation administrative des transferts n’est pas encore activée." });
    }
    const transferId = decodeURIComponent(params.transferId || "").trim();
    if (!transferId || transferId.length > 100) return privateJson({ state: "FORBIDDEN", message: "Transfer ID invalide." }, 400);
    const transfer = await callTransfertsReadApi(
      "GET_TRANSFER",
      { userId: authorization.userId, email: authorization.email, role: "ADMIN", agency: authorization.agency },
      { transferId }
    );
    return privateJson({
      state: "READY",
      transfer,
      writesEnabled: getTransfertsFeatureFlags().writesEnabled
    });
  } catch (error) {
    return error instanceof TransfertsConfigurationError
      ? privateJson({ state: "NOT_CONFIGURED", message: "Le module Transferts n’est pas configuré." }, 503)
      : privateJson({ state: "SERVICE_UNAVAILABLE", message: "Le service Transferts est temporairement indisponible." }, 503);
  }
}
function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
