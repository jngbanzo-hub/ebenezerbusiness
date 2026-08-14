import { NextResponse } from "next/server";
import { z } from "zod";

import { filterShipmentTrackingRows, SHIPMENT_STATUSES } from "@/features/admin/shipment-tracking";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readShipmentTrackingRows, updateShipmentStatus } from "@/server/admin-shipment-tracking";
import { OperationPerformanceTrace } from "@/server/operation-performance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const statusSchema = z.enum(SHIPMENT_STATUSES);
const itemSchema = z.object({ rowNumber: z.number().int().min(2).max(100000), identity: z.string().min(3).max(100000) }).strict();
const updateSchema = itemSchema.extend({ status: statusSchema }).strict();
const batchUpdateSchema = z.object({
  items: z.array(itemSchema).min(1).max(200),
  status: statusSchema
}).strict();

export async function GET(request: Request) {
  const requestStartedAt = performance.now();
  const trace = new OperationPerformanceTrace("shipment_tracking", crypto.randomUUID(), "ADMIN", requestStartedAt);
  try {
    const auth = await trace.measure("auth_session", () => authorizeAdminRequest(request));
    if (!auth.authorized) return failure(auth.status === 401 ? "Session invalide ou expirée." : "Accès interdit.", auth.status);
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? ""; const to = params.get("to") ?? "";
    const company = clean(params.get("company")) || "ALL"; const destination = clean(params.get("destination")) || "ALL";
    const status = params.get("status")?.trim() || "ALL"; const search = params.get("search")?.trim() || "";
    if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && from > to) || search.length > 100) return failure("Filtres invalides.", 400);
    const sourceRows = await readShipmentTrackingRows(trace);
    const filteringStartedAt = performance.now();
    const periodRows = filterShipmentTrackingRows(sourceRows, { from, to });
    const rows = filterShipmentTrackingRows(periodRows, { company, destination, status, search });
    const options = { companies: unique(periodRows.map((row) => row.company)), destinations: unique(periodRows.map((row) => row.destination)) };
    trace.add("filtres_serveur", performance.now() - filteringStartedAt);
    const responseStartedAt = performance.now();
    const response = NextResponse.json({ rows, options }, { headers: privateHeaders() });
    trace.add("reponse_serveur", performance.now() - responseStartedAt);
    trace.complete("success");
    response.headers.set("Server-Timing", trace.serverTiming());
    return response;
  } catch (error) {
    trace.complete("error");
    console.error("[admin-shipment-tracking-read-failed]", error instanceof Error ? error.message : String(error));
    return failure("Le suivi des expéditions est temporairement indisponible.", 503);
  }
}

export async function PATCH(request: Request) {
  const trace = new OperationPerformanceTrace("shipment_tracking_update", crypto.randomUUID(), "ADMIN");
  try {
    const auth = await trace.measure("auth_session", () => authorizeAdminRequest(request));
    if (!auth.authorized) return failure(auth.status === 401 ? "Session invalide ou expirée." : "Accès interdit.", auth.status);
    const validationStartedAt = performance.now();
    const body: unknown = await request.json().catch(() => null);
    const single = updateSchema.safeParse(body);
    if (single.success) {
      trace.add("validation_zod_statut", performance.now() - validationStartedAt);
      const selectionStartedAt = performance.now();
      trace.setItemCount(1);
      trace.add("validation_selection", performance.now() - selectionStartedAt);
      const row = await updateShipmentStatus(single.data.rowNumber, single.data.identity, single.data.status, trace);
      return tracedResponse({ ok: true, row }, trace, "success");
    }
    const batch = batchUpdateSchema.safeParse(body);
    trace.add("validation_zod_statut", performance.now() - validationStartedAt);
    if (!batch.success) {
      console.error("[admin-shipment-tracking-validation-failed]", JSON.stringify(batch.error.flatten()));
      return tracedResponse({ message: "Statut ou sélection invalide." }, trace, "error", 400);
    }
    const selectionStartedAt = performance.now();
    const uniqueItems = Array.from(new Map(batch.data.items.map((item) => [`${item.rowNumber}:${item.identity}`, item])).values());
    trace.add("validation_selection", performance.now() - selectionStartedAt);
    trace.setItemCount(uniqueItems.length);
    const results = [];
    for (const item of uniqueItems) {
      try {
        const row = await updateShipmentStatus(item.rowNumber, item.identity, batch.data.status, trace);
        results.push({ ok: true as const, rowNumber: item.rowNumber, row });
      } catch (error) {
        results.push({ ok: false as const, rowNumber: item.rowNumber, message: error instanceof Error ? error.message : "Échec inconnu." });
      }
    }
    return tracedResponse({ ok: results.every((result) => result.ok), results, succeeded: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length }, trace, results.every((result) => result.ok) ? "success" : "error");
  } catch (error) {
    trace.complete("error");
    console.error("[admin-shipment-tracking-write-failed]", error instanceof Error ? error.message : String(error));
    return failure("La mise à jour du statut a échoué.", 503);
  }
}
function tracedResponse(body: unknown, trace: OperationPerformanceTrace, result: "success" | "error", status = 200) {
  const responseStartedAt = performance.now();
  const response = NextResponse.json(body, { status, headers: privateHeaders() });
  trace.add("construction_reponse", performance.now() - responseStartedAt);
  trace.complete(result);
  response.headers.set("Server-Timing", trace.serverTiming());
  response.headers.set("X-Request-Id", trace.requestIdentifier());
  return response;
}
function clean(value: string | null) { return (value ?? "").trim().slice(0, 100); }
function isDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function unique(values: string[]) { return Array.from(new Set(values.filter(Boolean))).sort(); }
function privateHeaders() { return { "Cache-Control": "private, no-store, max-age=0" }; }
function failure(message: string, status: number) { return NextResponse.json({ message }, { status, headers: privateHeaders() }); }
