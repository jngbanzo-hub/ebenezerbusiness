import { NextResponse } from "next/server";

import { filterShipmentStatistics } from "@/features/admin/shipment-statistics";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readShipmentStatistics } from "@/server/admin-statistics-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) return failure(authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit.", authorization.status);
    const params = new URL(request.url).searchParams;
    let from = params.get("from") ?? ""; let to = params.get("to") ?? "";
    const year = params.get("year") ?? ""; const month = params.get("month") ?? "";
    if ((year && !/^\d{4}$/.test(year)) || (month && (!/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12))) return failure("Période invalide.", 400);
    if (year && !from && !to) { const selectedMonth = month ? Number(month) : 1; const lastMonth = month ? selectedMonth : 12; from = `${year}-${String(selectedMonth).padStart(2,"0")}-01`; to = `${year}-${String(lastMonth).padStart(2,"0")}-${String(new Date(Number(year), lastMonth, 0).getDate()).padStart(2,"0")}`; }
    if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && from > to)) return failure("Période invalide.", 400);
    const source = await readShipmentStatistics();
    const statistics = filterShipmentStatistics(source.shipments, { from, to, company: clean(params.get("company")), destination: clean(params.get("destination")), status: clean(params.get("status")) });
    return NextResponse.json({ statistics }, { headers: privateHeaders() });
  } catch {
    return failure("Les statistiques des expéditions sont temporairement indisponibles.", 503);
  }
}

function clean(value: string | null) { return (value ?? "").trim().toUpperCase().slice(0, 100); }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function failure(message: string, status: number) { return NextResponse.json({ message }, { status, headers: privateHeaders() }); }
function privateHeaders() { return { "Cache-Control": "private, no-store, max-age=0" }; }
