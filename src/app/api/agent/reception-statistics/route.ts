import { NextResponse } from "next/server";

import { projectReceptionStatistics, type ReceptionAgency } from "@/features/agent/reception-statistics";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { parseOptionalInteger, resolveShipmentDateRange } from "@/server/admin-statistics-filter-validation";
import { readShipmentStatistics } from "@/server/admin-statistics-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeAgentRequest(request);
  if (!authorization.authorized) return failure("ACCESS_DENIED", authorization.status);
  const agency = authorization.identity.site;
  if (!isReceptionAgency(agency)) return failure("ACCESS_DENIED", 403);
  try {
    const params = new URL(request.url).searchParams;
    let from = params.get("from") ?? "";
    let to = params.get("to") ?? "";
    const year = params.get("year") ?? "";
    const month = parseOptionalInteger(params.get("month"), 1, 12);
    const company = clean(params.get("company")) || "ALL";
    const status = clean(params.get("status")) || "ALL";
    const arrival = clean(params.get("arrival")) || "ALL";
    const search = (params.get("search") ?? "").trim();
    if (params.has("destination") || (year && !/^\d{4}$/.test(year)) || month === false || (month !== null && !year)
      || !["ALL", "ASKY", "ETHIOPIAN", "DHL", "AIR CONGO"].includes(company)
      || !["ALL", "ARRIVE", "EN ATTENTE"].includes(status)
      || !["ALL", "ARRIVED", "NOT_ARRIVED"].includes(arrival) || search.length > 100) {
      return failure("INVALID_FILTERS", 400);
    }
    const range = resolveShipmentDateRange({ year, month, from, to });
    if (range === false) return failure("INVALID_FILTERS", 400);
    ({ from, to } = range);
    if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && from > to)) {
      return failure("INVALID_FILTERS", 400);
    }
    const source = await readShipmentStatistics();
    const statistics = projectReceptionStatistics(source.shipments, agency, { from, to, company, status, arrival, search });
    return NextResponse.json({ statistics, filters: { from, to, year, month, company, status, arrival, search } }, { headers: privateHeaders() });
  } catch {
    return failure("RECEPTION_STATISTICS_UNAVAILABLE", 503);
  }
}

function isReceptionAgency(value: string): value is ReceptionAgency {
  return ["FIH", "LSHI", "KLZ"].includes(value);
}
function clean(value: string | null) { return (value ?? "").trim().toUpperCase().slice(0, 100); }
function isDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function failure(code: string, status: number) { return NextResponse.json({ code, message: "Statistiques de réception indisponibles." }, { status, headers: privateHeaders() }); }
function privateHeaders() { return { "Cache-Control": "private, no-store, max-age=0" }; }
