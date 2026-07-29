import { NextResponse } from "next/server";

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
    if (!getTransfertsFeatureFlags().adminEnabled) {
      return privateJson({ state: "PREPARATION", entries: [], message: "L’audit administratif Transferts n’est pas encore autorisé." });
    }
    if (!authorization.agency) return privateJson({ state: "NOT_CONFIGURED", entries: [], message: "Agence de traçabilité Admin non configurée." }, 503);
    const url = new URL(request.url);
    const payload = {
      agencyFrom: clean(url.searchParams.get("agencyFrom")),
      agencyTo: clean(url.searchParams.get("agencyTo")),
      dateFrom: clean(url.searchParams.get("from")),
      dateTo: clean(url.searchParams.get("to")),
      transferId: clean(url.searchParams.get("transferId"))
    };
    const data = await callTransfertsReadApi(
      "LIST_ADMIN_AUDIT",
      { userId: authorization.userId, email: authorization.email, role: "ADMIN", agency: authorization.agency },
      payload
    );
    const entries = Array.isArray(data) ? data : [];
    return privateJson({ state: entries.length ? "READY" : "EMPTY", entries, message: entries.length ? "Historique disponible." : "Aucun événement d’audit." });
  } catch (error) {
    return error instanceof TransfertsConfigurationError
      ? privateJson({ state: "NOT_CONFIGURED", entries: [], message: "Le module Transferts n’est pas configuré." }, 503)
      : privateJson({ state: "SERVICE_UNAVAILABLE", entries: [], message: "Le service Transferts est temporairement indisponible." }, 503);
  }
}
function clean(value: string | null) { return (value ?? "").trim().slice(0, 100); }
function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
