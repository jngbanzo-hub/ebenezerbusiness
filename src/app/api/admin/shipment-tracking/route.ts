import { NextResponse } from "next/server";
import { z } from "zod";

import { filterShipmentTrackingRows, isShipmentStatus } from "@/features/admin/shipment-tracking";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readShipmentTrackingRows, updateShipmentStatus } from "@/server/admin-shipment-tracking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const updateSchema = z.object({ rowNumber: z.number().int().min(2).max(100000), identity: z.string().min(3).max(500), status: z.string() }).strict();
const batchUpdateSchema = z.object({
  items: z.array(z.object({ rowNumber: z.number().int().min(2).max(100000), identity: z.string().min(3).max(500) }).strict()).min(1).max(200),
  status: z.string()
}).strict();

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
  } catch (error) {
    console.error("[admin-shipment-tracking-read-failed]", error instanceof Error ? error.message : String(error));
    return failure("Le suivi des expéditions est temporairement indisponible.", 503);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return failure(auth.status === 401 ? "Session invalide ou expirée." : "Accès interdit.", auth.status);
    const body: unknown = await request.json().catch(() => null);
    const single = updateSchema.safeParse(body);
    if (single.success) {
      if (!isShipmentStatus(single.data.status)) return failure("Statut ou ligne invalide.", 400);
      const row = await updateShipmentStatus(single.data.rowNumber, single.data.identity, single.data.status);
      return NextResponse.json({ ok: true, row }, { headers: privateHeaders() });
    }
    const batch = batchUpdateSchema.safeParse(body);
    if (!batch.success || !isShipmentStatus(batch.data.status)) return failure("Statut ou sélection invalide.", 400);
    const uniqueItems = Array.from(new Map(batch.data.items.map((item) => [`${item.rowNumber}:${item.identity}`, item])).values());
    const results = [];
    for (const item of uniqueItems) {
      try {
        const row = await updateShipmentStatus(item.rowNumber, item.identity, batch.data.status);
        results.push({ ok: true as const, rowNumber: item.rowNumber, row });
      } catch (error) {
        results.push({ ok: false as const, rowNumber: item.rowNumber, message: error instanceof Error ? error.message : "Échec inconnu." });
      }
    }
    return NextResponse.json({ ok: results.every((result) => result.ok), results, succeeded: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length }, { headers: privateHeaders() });
  } catch (error) {
    console.error("[admin-shipment-tracking-write-failed]", error instanceof Error ? error.message : String(error));
    return failure("La mise à jour du statut a échoué.", 503);
  }
}
function clean(value: string | null) { return (value ?? "").trim().slice(0, 100); }
function isDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function privateHeaders() { return { "Cache-Control": "private, no-store, max-age=0" }; }
function failure(message: string, status: number) { return NextResponse.json({ message }, { status, headers: privateHeaders() }); }
