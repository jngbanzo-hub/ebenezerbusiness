import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminStockagesStatus } from "@/server/stockages-sheets";

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

    const status = await readAdminStockagesStatus();
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
