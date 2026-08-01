import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { resolveInterAgencyQuote } from "@/server/inter-agency-routing";
import { requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const url = new URL(request.url);
    const quote = await resolveInterAgencyQuote({
      trackingCode: url.searchParams.get("trackingCode") ?? "",
      origin: requireStorageAgency(url.searchParams.get("sourceAgency") ?? ""),
      destination: requireStorageAgency(auth.identity.site)
    });
    return NextResponse.json({ state: "SUCCESS", quote }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof StockagesV2Error) return fail(error.code, error.status);
    return fail("INTER_AGENCY_SOURCE_UNAVAILABLE", 503);
  }
}

function fail(code: string, status: number) {
  const messages: Record<string, string> = {
    INVALID_INTER_AGENCY_ROUTE: "Cet acheminement inter-agences n’est pas autorisé.",
    STORAGE_AGENCY_NOT_SUPPORTED: "L’agence concernée n’est pas prise en charge par le Stockage.",
    PARCEL_NOT_FOUND: "Le colis est introuvable dans l’agence d’origine.",
    PARCEL_WEIGHT_UNAVAILABLE: "Le poids canonique du colis est indisponible.",
    PARCEL_WEIGHT_AMBIGUOUS: "Le poids canonique du colis doit être vérifié.",
    INTER_AGENCY_SOURCE_UNAVAILABLE: "Impossible de lire les données du colis dans l’agence d’origine."
  };
  return NextResponse.json(
    { state: "ERROR", code, message: messages[code] ?? "Le devis inter-agences a été refusé." },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}
