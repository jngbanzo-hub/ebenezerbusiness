import { NextResponse } from "next/server";

import type { StorageExitPeriod } from "@/features/stockages/admin-storage-exits-model";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminStorageExits } from "@/server/admin-storage-exits";
import { isStockagesV2Enabled, requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PERIODS = new Set<StorageExitPeriod>(["today", "yesterday", "week", "month", "year", "custom"]);

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const search = new URL(request.url).searchParams;
    const agency = requireStorageAgency(search.get("agency") ?? "");
    const period = search.get("period") ?? "today";
    if (!PERIODS.has(period as StorageExitPeriod)) return fail("INVALID_PERIOD", 400);
    const pageText = search.get("page") ?? "1";
    if (!/^[1-9]\d*$/.test(pageText) || !Number.isSafeInteger(Number(pageText))) return fail("INVALID_PAGE", 400);
    const yearText = search.get("year");
    if (period === "year" && (!yearText || !/^\d{4}$/.test(yearText))) return fail("INVALID_YEAR", 400);
    const result = await readAdminStorageExits({
      agency,
      period: period as StorageExitPeriod,
      year: yearText ? Number(yearText) : undefined,
      from: search.get("from") ?? undefined,
      to: search.get("to") ?? undefined,
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

function fail(code: string, status: number) {
  return NextResponse.json({ state: "ERROR", code, message: "Historique des sorties indisponible ou incomplet." }, { status, headers: { "Cache-Control": "private, no-store" } });
}
