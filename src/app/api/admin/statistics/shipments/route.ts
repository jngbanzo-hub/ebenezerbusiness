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
    const company = clean(params.get("company")) || "ALL"; const destination = clean(params.get("destination")) || "ALL"; const status = clean(params.get("status")) || "ALL"; const arrival = clean(params.get("arrival")) || "ALL"; const search = (params.get("search") ?? "").trim();
    const page = parseInteger(params.get("page"), 1, 100000, 1); const pageSize = parseInteger(params.get("pageSize"), 10, 100, 25);
    if ((year && !/^\d{4}$/.test(year)) || (month && (!year || !/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12)) || !["ALL", "ASKY", "ETHIOPIAN", "DHL", "AIR CONGO"].includes(company) || !["ALL", "FIH", "LSHI", "KLZ"].includes(destination) || !["ALL", "ARRIVE", "EN ATTENTE"].includes(status) || !["ALL", "ARRIVED", "NOT_ARRIVED"].includes(arrival) || search.length > 100 || page === false || pageSize === false) return failure("Filtres invalides.", 400);
    if (year && !from && !to) { const selectedMonth = month ? Number(month) : 1; const lastMonth = month ? selectedMonth : 12; from = `${year}-${String(selectedMonth).padStart(2,"0")}-01`; to = `${year}-${String(lastMonth).padStart(2,"0")}-${String(new Date(Number(year), lastMonth, 0).getDate()).padStart(2,"0")}`; }
    if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && from > to)) return failure("Période invalide.", 400);
    const source = await readShipmentStatistics();
    const filtered = filterShipmentStatistics(source.shipments, { from, to, company, destination, status, arrival, search });
    const totalPages = Math.max(1, Math.ceil(filtered.shipments.length / pageSize)); if (page > totalPages) return failure("Page invalide.", 400);
    const statistics = { ...filtered, shipments: filtered.shipments.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, totalResults: filtered.shipments.length, totalPages } };
    return NextResponse.json({ statistics, filters: { from, to, year, month, company, destination, status, arrival, search } }, { headers: privateHeaders() });
  } catch {
    return failure("Les statistiques des expéditions sont temporairement indisponibles.", 503);
  }
}

function clean(value: string | null) { return (value ?? "").trim().toUpperCase().slice(0, 100); }
function isDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function parseInteger(value: string | null, min: number, max: number, fallback: number) { if (!value) return fallback; if (!/^\d+$/.test(value)) return false; const parsed = Number(value); return parsed >= min && parsed <= max ? parsed : false; }
function failure(message: string, status: number) { return NextResponse.json({ message }, { status, headers: privateHeaders() }); }
function privateHeaders() { return { "Cache-Control": "private, no-store, max-age=0" }; }
