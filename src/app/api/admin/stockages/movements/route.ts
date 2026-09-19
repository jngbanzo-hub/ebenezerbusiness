import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminStockagesMovements } from "@/server/stockages-sheets";

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

    const url = new URL(request.url);
    const result = await readAdminStockagesMovements({
      site: url.searchParams.get("agency") ?? "",
      date: url.searchParams.get("date") ?? "",
      parcelCode: url.searchParams.get("parcelCode") ?? "",
      movementType: url.searchParams.get("movementType") ?? "",
      triggerStatus: url.searchParams.get("triggerStatus") ?? "",
      state: url.searchParams.get("state") ?? "ALL"
    });
    return NextResponse.json(result, { headers: privateNoStoreHeaders() });
  } catch {
    return jsonError(
      "L’historique Stockages est temporairement indisponible.",
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
