import { buildParcelReadModel } from "../../../../../local-preparation/read-model/parcel-read-model";
import { normalizeParcelCode } from "../../../../../local-preparation/contracts/stock-event";

import { findLocalParcelHistory } from "./local-logistics-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

export async function GET(request: Request): Promise<Response> {
  const rawTrackingCode = new URL(request.url).searchParams.get("trackingCode");
  let trackingCode: string;

  try {
    trackingCode = normalizeParcelCode(rawTrackingCode);
  } catch {
    return jsonError(
      "INVALID_TRACKING_CODE",
      "Le paramètre trackingCode est absent ou invalide.",
      400,
    );
  }

  const history = findLocalParcelHistory(trackingCode);
  if (history === null) {
    return jsonError("PARCEL_NOT_FOUND", "Colis introuvable.", 404);
  }

  try {
    const model = buildParcelReadModel(history);
    return Response.json(
      {
        trackingCode: model.trackingCode,
        destinationInitiale: model.destinationInitiale,
        destinationCourante: model.destinationCourante,
        locationState: model.locationState,
        currentAgency: model.currentAgency,
        transitFrom: model.transitFrom,
        transitTo: model.transitTo,
        deliveredAt: model.deliveredAt,
        agentStatus: model.agentStatus,
        activeArrivalAnomaly: model.activeArrivalAnomaly,
        version: model.version,
        updatedAt: model.updatedAt,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return jsonError(
      "INVALID_LOGISTICS_HISTORY",
      "L’historique logistique du colis est invalide.",
      422,
    );
  }
}

function jsonError(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: NO_STORE_HEADERS },
  );
}
