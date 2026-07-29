import { NextResponse } from "next/server";

import type { TransferSummary, TransfersPageResponse } from "@/features/transferts/types";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { callTransfertsReadApi, TransfertsConfigurationError } from "@/server/transferts-apps-script";
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
    if (!flags.adminEnabled) return privateJson(preparation(authorization.agency));
    if (!authorization.agency) {
      return privateJson({ ...preparation(null), message: "Agence de traçabilité Admin non configurée." }, 503);
    }
    const url = new URL(request.url);
    const payload = {
      agencyFrom: clean(url.searchParams.get("agencyFrom")),
      agencyTo: clean(url.searchParams.get("agencyTo")),
      agency: clean(url.searchParams.get("agency")),
      dateFrom: clean(url.searchParams.get("from")),
      dateTo: clean(url.searchParams.get("to")),
      status: clean(url.searchParams.get("status")),
      currency: clean(url.searchParams.get("currency")),
      transferId: clean(url.searchParams.get("transferId"))
    };
    const data = await callTransfertsReadApi(
      "LIST_ADMIN_TRANSFERS",
      { userId: authorization.userId, email: authorization.email, role: "ADMIN", agency: authorization.agency },
      payload
    );
    const transfers = Array.isArray(data) ? (data as TransferSummary[]) : [];
    return privateJson({
      state: transfers.length ? "READY" : "EMPTY",
      moduleStatus: "PREPARATION",
      role: "ADMIN",
      agency: authorization.agency,
      apiAvailable: true,
      writesEnabled: false,
      adminEnabled: false,
      transfers,
      message: transfers.length ? "Consultation administrative." : "Aucun transfert ne correspond aux filtres."
    } satisfies TransfersPageResponse);
  } catch (error) {
    return error instanceof TransfertsConfigurationError
      ? privateJson({ state: "NOT_CONFIGURED", message: "Le module Transferts n’est pas configuré." }, 503)
      : privateJson({ state: "SERVICE_UNAVAILABLE", message: "Le service Transferts est temporairement indisponible." }, 503);
  }
}

function preparation(agency: TransfersPageResponse["agency"]): TransfersPageResponse {
  return { state: "PREPARATION", moduleStatus: "PREPARATION", role: "ADMIN", agency, apiAvailable: false, writesEnabled: false, adminEnabled: false, transfers: [], message: "La consultation administrative Transferts n’est pas encore autorisée." };
}
function clean(value: string | null) { return (value ?? "").trim().slice(0, 100); }
function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
