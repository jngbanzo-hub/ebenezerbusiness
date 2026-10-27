import { NextResponse } from "next/server";

import type { StorageExitScope } from "@/features/stockages/admin-storage-exits-model";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminStorageExits } from "@/server/admin-storage-exits";
import { isStockagesV2Enabled, requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PERIODS = new Set<StorageExitScope>(["today", "yesterday", "week", "month", "year", "custom", "all"]);

export async function GET(request: Request) {
  try {
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const search = new URL(request.url).searchParams;
    const agency = requireStorageAgency(search.get("agency") ?? "");
    const code = (search.get("code") ?? "").trim().toUpperCase();
    const period = search.get("period") ?? (code ? "all" : "today");
    if (!PERIODS.has(period as StorageExitScope)) return fail("INVALID_PERIOD", 400);
    if (code.length > 120 || (period === "all" && !code)) return fail("INVALID_CODE", 400);
    const pageText = search.get("page") ?? "1";
    if (!/^[1-9]\d*$/.test(pageText) || !Number.isSafeInteger(Number(pageText))) return fail("INVALID_PAGE", 400);
    const yearText = search.get("year");
    if (period === "year" && (!yearText || !/^\d{4}$/.test(yearText))) return fail("INVALID_YEAR", 400);
    const from = search.get("from") ?? undefined;
    const to = search.get("to") ?? undefined;
    if (period === "custom" && from && to && from > to) {
      return fail("INVALID_DATE_RANGE", 400, "La date de début doit être antérieure ou égale à la date de fin.");
    }
    const result = await readAdminStorageExits({
      agency,
      period: period as StorageExitScope,
      code: code || undefined,
      year: yearText ? Number(yearText) : undefined,
      from,
      to,
      page: Number(pageText),
      pageSize: 25
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    if (cause instanceof StockagesV2Error) return fail(cause.code, cause.status);
    if (cause instanceof Error && ["INVALID_DATE_RANGE", "INVALID_YEAR", "INVALID_PERIOD"].includes(cause.message)) return fail(cause.message, 400);
    return fail("STORAGE_EXIT_READ_INCOMPLETE", 503);
  }
}

function fail(code: string, status: number, message = "Historique des sorties indisponible ou incomplet.") {
  return NextResponse.json({ state: "ERROR", code, message }, { status, headers: { "Cache-Control": "private, no-store" } });
}
