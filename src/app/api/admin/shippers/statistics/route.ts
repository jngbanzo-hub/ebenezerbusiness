import { NextResponse } from "next/server";

import { calculateShipperStatistics } from "@/features/admin/shippers";
import {
  MANIFEST_DESTINATIONS,
  MANIFEST_SITES,
  type ManifestDestination,
  type ManifestSite
} from "@/features/admin/types";
import { isValidAdminDateRange } from "@/features/admin/period";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminManifestRows } from "@/server/admin-manifest-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) {
      return jsonError(
        authorization.status === 401
          ? "Session invalide ou expirée."
          : "Accès interdit.",
        authorization.status
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const shipper = searchParams.get("shipper")?.trim() ?? "";
    const startDate = searchParams.get("from") ?? "";
    const endDate = searchParams.get("to") ?? "";
    const site = (searchParams.get("site") ?? "ALL").toUpperCase();
    const destination = searchParams.get("destination") ?? "ALL";

    if (
      shipper.length < 2 ||
      shipper.length > 100 ||
      !isValidAdminDateRange({ startDate, endDate }) ||
      !isManifestSiteFilter(site) ||
      !isManifestDestinationFilter(destination)
    ) {
      return jsonError("Paramètres de recherche invalides.", 400);
    }

    const rows = await readAdminManifestRows();
    const statistics = calculateShipperStatistics(rows, {
      shipper,
      startDate,
      endDate,
      site,
      destination
    });

    return NextResponse.json(
      { statistics },
      { headers: privateNoStoreHeaders() }
    );
  } catch {
    return jsonError(
      "Les statistiques par expéditeur sont temporairement indisponibles.",
      503
    );
  }
}

function isManifestSiteFilter(
  value: string
): value is ManifestSite | "ALL" {
  return value === "ALL" || MANIFEST_SITES.includes(value as ManifestSite);
}

function isManifestDestinationFilter(
  value: string
): value is ManifestDestination | "ALL" {
  return (
    value === "ALL" ||
    MANIFEST_DESTINATIONS.includes(value as ManifestDestination)
  );
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { message },
    { status, headers: privateNoStoreHeaders() }
  );
}

function privateNoStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0"
  };
}
