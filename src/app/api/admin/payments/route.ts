import { NextResponse } from "next/server";

import { filterAdminPayments } from "@/features/admin/payments";
import { isValidAdminDateRange } from "@/features/admin/period";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminPayments } from "@/server/admin-payments-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) {
      return jsonError(
        authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit.",
        authorization.status
      );
    }

    const url = new URL(request.url);
    const range = {
      startDate: url.searchParams.get("from") ?? "",
      endDate: url.searchParams.get("to") ?? ""
    };

    if (!isValidAdminDateRange(range)) {
      return jsonError("Période invalide.", 400);
    }

    const payments = await readAdminPayments();
    const periodPayments = filterAdminPayments(payments, {
      ...range,
      site: "ALL",
      destination: "ALL",
      codeColis: "",
      agent: ""
    });

    return NextResponse.json(
      { payments: periodPayments },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0"
        }
      }
    );
  } catch {
    return jsonError("Le chargement des encaissements est temporairement indisponible.", 503);
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0"
      }
    }
  );
}
