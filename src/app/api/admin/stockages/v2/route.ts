import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { isStockagesV2Enabled, readAdminStorage, runAdminStorageCommand, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    return NextResponse.json(await readAdminStorage(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) { return handle(cause); }
}

export async function POST(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const body = await request.json() as Record<string, unknown>;
    const result = await runAdminStorageCommand(String(body.action ?? ""), body, auth.userId);
    return NextResponse.json({ state: "SUCCESS", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (cause) { return handle(cause); }
}

function handle(cause: unknown) { return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("STORAGE_SERVICE_UNAVAILABLE", 503); }
function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: code.includes("NOT_ACTIVE") ? "Le compte Stockages doit être ACTIVE." : "Commande administrative refusée." }, { status }); }
