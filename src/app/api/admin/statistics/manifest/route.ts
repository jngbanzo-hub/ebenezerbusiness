import { NextResponse } from "next/server";

import { buildManifestStatisticsFromParcelRows, buildParcelStatusSituation, PARCEL_STATUSES, type ParcelDestination, type ParcelStatus } from "@/features/admin/parcel-status-statistics";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readParcelStatusRows } from "@/server/admin-statistics-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) return failure(authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit.", authorization.status);
    const params = new URL(request.url).searchParams;
    const year = parseOptionalInteger(params.get("year"), 2020, 2100);
    const month = parseOptionalInteger(params.get("month"), 1, 12);
    const fromMonth = params.get("fromMonth") ?? ""; const toMonth = params.get("toMonth") ?? "";
    const destination = (params.get("destination") ?? "ALL").toUpperCase(); const status = (params.get("status") ?? "ALL").toUpperCase();
    const measure = (params.get("measure") ?? "BOTH").toUpperCase();
    if (year === false || month === false || (month && !year) || !isMonth(fromMonth) || !isMonth(toMonth) || (fromMonth && toMonth && fromMonth > toMonth) || !["ALL", "FIH", "LSHI", "KLZ"].includes(destination) || !(status === "ALL" || PARCEL_STATUSES.includes(status as ParcelStatus)) || !["KILOGRAMS", "PARCELS", "BOTH"].includes(measure)) return failure("Filtres invalides.", 400);
    const effectiveFrom = fromMonth || (year ? `${year}-${String(month || 1).padStart(2, "0")}` : "");
    const effectiveTo = toMonth || (year ? `${year}-${String(month || 12).padStart(2, "0")}` : "");
    const parcelRows = await readParcelStatusRows();
    const situation = buildParcelStatusSituation(parcelRows, { fromMonth: effectiveFrom || undefined, toMonth: effectiveTo || undefined, destination: destination as ParcelDestination | "ALL", status: status as ParcelStatus | "ALL" });
    const statistics = buildManifestStatisticsFromParcelRows(situation.rows);
    return NextResponse.json({ statistics, situation, filters: { year, month, fromMonth, toMonth, destination, status, measure, dateField: "Date d’enregistrement (colonne A)" } }, { headers: privateHeaders() });
  } catch {
    return failure("Les statistiques du manifeste sont temporairement indisponibles.", 503);
  }
}

function parseOptionalInteger(value: string | null, min: number, max: number) { if (!value) return null; if (!/^\d+$/.test(value)) return false; const parsed = Number(value); return parsed >= min && parsed <= max ? parsed : false; }
function isMonth(value: string) { return value === "" || /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function failure(message: string, status: number) { return NextResponse.json({ message }, { status, headers: privateHeaders() }); }
function privateHeaders() { return { "Cache-Control": "private, no-store, max-age=0" }; }
