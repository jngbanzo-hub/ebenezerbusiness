import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminStockagesAudit } from "@/server/stockages-sheets";

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
    const result = await readAdminStockagesAudit({
      site: url.searchParams.get("agency") ?? "",
      date: url.searchParams.get("date") ?? "",
      user: url.searchParams.get("user") ?? "",
      action: url.searchParams.get("action") ?? "",
      reference: url.searchParams.get("reference") ?? "",
      result: url.searchParams.get("result") ?? ""
    });
    return NextResponse.json(result, { headers: privateNoStoreHeaders() });
  } catch {
    return jsonError("L’audit Stockages est temporairement indisponible.", 503);
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
