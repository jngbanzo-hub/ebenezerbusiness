import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { authorizeReminderBilanRead } from "@/server/reminder-bilan-machine-auth";
import { readExhaustivePages } from "@/server/exhaustive-pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AGENCIES = new Set(["FIH", "LSHI", "KLZ"]);
const CODE = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;

/** Read-only, bounded physical evidence for the isolated reminder worker. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  if (!authorizeReminderBilanRead(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  const url = new URL(request.url);
  const agency = url.searchParams.get("agency")?.trim().toUpperCase() ?? "";
  const codes = url.searchParams.getAll("code").map(value => value.trim().toUpperCase());
  if (!AGENCIES.has(agency) || codes.length < 1 || codes.length > 50 || new Set(codes).size !== codes.length || codes.some(code => !CODE.test(code))) {
    return NextResponse.json({ error: "INVALID_SELECTOR" }, { status: 400, headers });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: "SOURCE_UNAVAILABLE" }, { status: 503, headers });
  try {
    const client = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
    const parcels = (await readExhaustivePages(async (from, to) => {
      const response = await client.from("stockage_parcels")
        .select("parcel_id,forwarding_id,tracking_code,agency,canonical_weight_kg,weight_source_reference,delivery_status,stockage_forwardings(destination_agency,forwarding_reference)")
        .eq("agency", agency).in("tracking_code", codes).order("parcel_id", { ascending: true }).range(from, to);
      if (response.error) throw response.error;
      return response.data ?? [];
    }, { identity: row => String(row.parcel_id) })).rows;
    const arrivalIds = Array.from(new Set(parcels.map(row => String(row.weight_source_reference ?? "")).filter(value => value.startsWith("arrival:")).map(value => value.slice(8)).filter(Boolean)));
    const forwardingIds = Array.from(new Set(parcels.map(row => row.forwarding_id).filter((value): value is string => typeof value === "string" && !!value)));
    const trackedCodes = Array.from(new Set([...codes, ...parcels.flatMap(row => {
      const forwarding = row.stockage_forwardings as unknown as { forwarding_reference: string } | Array<{ forwarding_reference: string }> | null;
      const reference = Array.isArray(forwarding) ? forwarding[0]?.forwarding_reference : forwarding?.forwarding_reference;
      return reference ? [reference] : [];
    })]));
    const readEvents = async (kind: "tracked" | "manual" | "forwarding") => {
      if (kind === "manual" && !arrivalIds.length) return [];
      if (kind === "forwarding" && !forwardingIds.length) return [];
      return (await readExhaustivePages(async (from, to) => {
        let query = client.from("stockage_events")
          .select("event_id,event_type,agency,tracking_code,request_id,business_date,occurred_at,parcel_count_delta,source_type,source_request_id,metadata")
          .eq("agency", agency);
        if (kind === "tracked") query = query.in("tracking_code", trackedCodes);
        if (kind === "manual") query = query.eq("event_type", "MANUAL_ARRIVAL_RECORDED").in("request_id", arrivalIds);
        if (kind === "forwarding") query = query.eq("event_type", "ARRIVAGE_ACHEMINEMENT").in("source_request_id", forwardingIds);
        const response = await query.order("event_id", { ascending: true }).range(from, to);
        if (response.error) throw response.error;
        return response.data ?? [];
      }, { identity: row => String(row.event_id) })).rows;
    };
    const eventSets = await Promise.all([readEvents("tracked"), readEvents("manual"), readEvents("forwarding")]);
    const events = Array.from(new Map(eventSets.flat().map(row => [String(row.event_id), row])).values());
    const proofs = parcels.map(parcel => {
      const code = String(parcel.tracking_code);
      const parcelId = String(parcel.parcel_id);
      const forwardingId = parcel.forwarding_id ? String(parcel.forwarding_id) : null;
      const weightKg = Number(parcel.canonical_weight_kg);
      const weightSourceReference = String(parcel.weight_source_reference ?? "");
      type ArrivalProof = { type: string; agency: string; businessDate: string; requestId?: string; parcels?: Array<{ code: string; weightKg: number }>; eventId?: string; forwardingId?: string; parcelId?: string };
      const arrivals = events.flatMap((event): ArrivalProof[] => {
        const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};
        const eventType = String(event.event_type ?? "");
        const businessDate = String(event.business_date ?? "");
        if (eventType === "MANUAL_ARRIVAL_RECORDED" && !forwardingId && weightSourceReference === `arrival:${event.request_id}`) {
          const entries = Array.isArray(metadata.parcels) ? metadata.parcels as Array<Record<string, unknown>> : [];
          const matching = entries.filter(entry => String(entry.trackingCode ?? "").toUpperCase() === code && Number(entry.weightKg) === weightKg);
          if (matching.length !== 1) return [];
          return [{ type: eventType, agency, businessDate, requestId: String(event.request_id), parcels: [{ code, weightKg }] }];
        }
        if (eventType === "ARRIVAGE_ACHEMINEMENT" && forwardingId && String(event.source_request_id ?? "") === forwardingId && String(metadata.parcelId ?? "") === parcelId) {
          return [{ type: eventType, agency, businessDate, eventId: String(event.event_id), forwardingId, parcelId }];
        }
        return [];
      });
      const selectedArrival = arrivals.length === 1 ? arrivals[0] : null;
      const arrivalTime = selectedArrival ? events.find(event =>
        (selectedArrival.requestId && String(event.request_id ?? "") === selectedArrival.requestId)
        || (selectedArrival.eventId && String(event.event_id ?? "") === selectedArrival.eventId))?.occurred_at : null;
      const forwarding = parcel.stockage_forwardings as unknown as { destination_agency: string; forwarding_reference: string } | Array<{ destination_agency: string; forwarding_reference: string }> | null;
      const reference = Array.isArray(forwarding) ? forwarding[0]?.forwarding_reference : forwarding?.forwarding_reference;
      const exitCodes = new Set([code, reference?.toUpperCase()].filter(Boolean));
      const exits = events.filter(event => exitCodes.has(String(event.tracking_code ?? "").toUpperCase()) && Number(event.parcel_count_delta) < 0);
      const laterExit = !arrivalTime || exits.some(event => String(event.occurred_at ?? "") >= String(arrivalTime));
      const destinationAgency = Array.isArray(forwarding) ? forwarding[0]?.destination_agency : forwarding?.destination_agency;
      return { code, agency, parcelId, forwardingId, nature: forwardingId ? "FORWARDING" : "NATIF", status: parcel.delivery_status,
        destinationAgency: destinationAgency ?? null, weightKg, weightSourceReference, arrivals, arrivalEventId: selectedArrival?.eventId ?? null,
        exitsChecked: true, laterExit };
    });
    return NextResponse.json({ certified: true, source: "STOCKAGE_V2", proofs }, { headers });
  } catch {
    return NextResponse.json({ error: "SOURCE_UNAVAILABLE" }, { status: 503, headers });
  }
}
