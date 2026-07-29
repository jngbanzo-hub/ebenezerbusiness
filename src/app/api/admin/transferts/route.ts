import { NextResponse } from "next/server";

import type { TransfersPageResponse } from "@/features/transferts/types";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { callTransfertsReadApi, TransfertsConfigurationError } from "@/server/transferts-apps-script";
import {
  AdminTransferFilterError,
  calculateAdminTransferStatistics,
  filterAdminTransfers,
  parseAdminTransferFilters,
  parseAdminTransfers
} from "@/server/transferts-admin-statistics";
import { assertTransfertsReadOnlyMode, getTransfertsFeatureFlags } from "@/server/transferts-feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertTransfertsReadOnlyMode();
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) {
      return privateJson({ state: "FORBIDDEN", message: authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit." }, authorization.status);
    }
    const flags = getTransfertsFeatureFlags();
    if (!authorization.agency) {
      return privateJson({
        ...preparation(null),
        state: "NOT_CONFIGURED",
        message: "Le profil administrateur ne possède pas encore une agence de traçabilité valide."
      }, 503);
    }
    const url = new URL(request.url);
    const filters = parseAdminTransferFilters(url.searchParams);
    if (!flags.adminEnabled) return privateJson({ ...preparation(authorization.agency), filters });
    const data = await callTransfertsReadApi(
      "LIST_ADMIN_TRANSFERS",
      { userId: authorization.userId, email: authorization.email, role: "ADMIN", agency: authorization.agency },
      {}
    );
    const allTransfers = parseAdminTransfers(data);
    const transfers = filterAdminTransfers(allTransfers, filters);
    const statistics = calculateAdminTransferStatistics(allTransfers);
    return privateJson({
      state: transfers.length ? "READY" : "EMPTY",
      moduleStatus: "PREPARATION",
      role: "ADMIN",
      agency: authorization.agency,
      apiAvailable: true,
      writesEnabled: false,
      adminEnabled: true,
      transfers,
      statistics,
      filters,
      message: transfers.length ? "Consultation administrative." : "Aucun transfert ne correspond aux filtres."
    } satisfies TransfersPageResponse);
  } catch (error) {
    if (error instanceof AdminTransferFilterError) {
      return privateJson({ state: "FORBIDDEN", message: "Filtre Transferts invalide." }, 400);
    }
    return error instanceof TransfertsConfigurationError
      ? privateJson({ state: "NOT_CONFIGURED", message: "Le module Transferts n’est pas configuré." }, 503)
      : privateJson({ state: "SERVICE_UNAVAILABLE", message: "Le service Transferts est temporairement indisponible." }, 503);
  }
}

function preparation(agency: TransfersPageResponse["agency"]): TransfersPageResponse {
  return { state: "PREPARATION", moduleStatus: "PREPARATION", role: "ADMIN", agency, apiAvailable: false, writesEnabled: false, adminEnabled: false, transfers: [], statistics: null, message: "La consultation administrative des transferts n’est pas encore activée." };
}
function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
