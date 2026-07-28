import { NextResponse } from "next/server";

import { buildShipperSuggestions } from "@/features/admin/shippers";
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

    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 100) {
      return NextResponse.json(
        { shippers: [] },
        { headers: privateNoStoreHeaders() }
      );
    }

    const rows = await readAdminManifestRows();
    return NextResponse.json(
      { shippers: buildShipperSuggestions(rows, query) },
      { headers: privateNoStoreHeaders() }
    );
  } catch {
    return jsonError(
      "La recherche des expéditeurs est temporairement indisponible.",
      503
    );
  }
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
