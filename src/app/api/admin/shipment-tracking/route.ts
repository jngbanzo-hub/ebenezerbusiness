import { NextResponse } from "next/server";
import { z } from "zod";

import { filterShipmentTrackingRows, isShipmentStatus } from "@/features/admin/shipment-tracking";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readShipmentTrackingRows, updateShipmentStatus } from "@/server/admin-shipment-tracking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const updateSchema = z.object({ rowNumber: z.number().int().min(2).max(100000), identity: z.string().min(3).max(500), status: z.string() }).strict();

export async function GET(request: Request) {
  try {
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return failure(auth.status === 401 ? "Session invalide ou expirée." : "Accès interdit.", auth.status);
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? ""; const to = params.get("to") ?? "";
    const company = clean(params.get("company")) || "ALL"; const destination = clean(params.get("destination")) || "ALL";
    const status = params.get("status")?.trim() || "ALL"; const search = params.get("search")?.trim() || "";
    if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && from > to) || search.length > 100) return failure("Filtres invalides.", 400);
    const rows = filterShipmentTrackingRows(await readShipmentTrackingRows(), { from, to, company, destination, status, search });
    return NextResponse.json({ rows }, { headers: privateHeaders() });
  } catch { return failure("Le suivi des expéditions est temporairement indisponible.", 503); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return failure(auth.status === 401 ? "Session invalide ou expirée." : "Accès interdit.", auth.status);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isShipmentStatus(parsed.data.status)) return failure("Statut ou ligne invalide.", 400);
    const row = await updateShipmentStatus(parsed.data.rowNumber, parsed.data.identity, parsed.data.status);
    return NextResponse.json({ ok: true, row }, { headers: privateHeaders() });
  } catch { return failure("La mise à jour du statut a échoué.", 503); }
}
function clean(value: string | null) { return (value ?? "").trim().slice(0, 100); }
function isDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function privateHeaders() { return { "Cache-Control": "private, no-store, max-age=0" }; }
function failure(message: string, status: number) { return NextResponse.json({ message }, { status, headers: privateHeaders() }); }
