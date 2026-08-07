import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { resolveDestinationPaymentParcel } from "@/server/destination-payment-parcel";
import {
  isStockagesV2Enabled,
  requireStorageAgency,
  StockagesV2Error
} from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const agency = requireStorageAgency(auth.identity.site);
    const parcel = await resolveDestinationPaymentParcel(
      new URL(request.url).searchParams.get("trackingCode") ?? "",
      agency
    );
    return NextResponse.json(
      { state: "SUCCESS", parcel },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (cause) {
    if (cause instanceof StockagesV2Error) {
      return fail(cause.code, cause.status);
    }
    return fail("STORAGE_SERVICE_UNAVAILABLE", 503);
  }
}

function fail(code: string, status: number) {
  const message =
    code === "PARCEL_NOT_IN_AGENCY_STORAGE"
      ? "Ce colis n’est pas présent dans le Stockage de votre agence."
      : "Recherche Encaissements indisponible.";
  return NextResponse.json(
    { state: "ERROR", code, message },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}
