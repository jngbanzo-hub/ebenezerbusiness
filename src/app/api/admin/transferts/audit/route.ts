import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { callTransfertsReadApi, TransfertsConfigurationError } from "@/server/transferts-apps-script";
import {
  AdminTransferFilterError,
  parseAdminTransferFilters,
  resolveAdminPeriodBounds
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
    if (!authorization.agency) return privateJson({ state: "NOT_CONFIGURED", entries: [], message: "Le profil administrateur ne possède pas encore une agence de traçabilité valide." }, 503);
    if (!getTransfertsFeatureFlags().adminEnabled) {
      return privateJson({ state: "PREPARATION", entries: [], message: "La consultation administrative des transferts n’est pas encore activée." });
    }
    const url = new URL(request.url);
    const filters = parseAdminTransferFilters(url.searchParams);
    const period = resolveAdminPeriodBounds(filters);
    const payload = {
      agencyFrom: filters.agencyFrom,
      agencyTo: filters.agencyTo,
      dateFrom: period.from,
      dateTo: period.to,
      transferId: filters.transferId
    };
    const data = await callTransfertsReadApi(
      "LIST_ADMIN_AUDIT",
      { userId: authorization.userId, email: authorization.email, role: "ADMIN", agency: authorization.agency },
      payload
    );
    const entries = Array.isArray(data) ? data : [];
    return privateJson({ state: entries.length ? "READY" : "EMPTY", entries, message: entries.length ? "Historique disponible." : "Aucun événement d’audit." });
  } catch (error) {
    if (error instanceof AdminTransferFilterError) {
      return privateJson({ state: "FORBIDDEN", entries: [], message: "Filtre Audit invalide." }, 400);
    }
    return error instanceof TransfertsConfigurationError
      ? privateJson({ state: "NOT_CONFIGURED", entries: [], message: "Le module Transferts n’est pas configuré." }, 503)
      : privateJson({ state: "SERVICE_UNAVAILABLE", entries: [], message: "Le service Transferts est temporairement indisponible." }, 503);
  }
}
function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
