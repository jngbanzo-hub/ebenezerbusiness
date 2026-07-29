import { NextResponse } from "next/server";

import { STOCKAGES_SITES } from "@/features/stockages/types";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readStockagesPreparationStatus } from "@/server/stockages-sheets";

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

    const status = await readStockagesPreparationStatus(STOCKAGES_SITES);
    return NextResponse.json(status, {
      headers: privateNoStoreHeaders()
    });
  } catch {
    return jsonError(
      "Le statut Stockages est temporairement indisponible.",
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
