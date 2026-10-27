export const STORAGE_EXIT_TYPES = [
  "CONFIRMED_DELIVERY_RECORDED",
  "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION",
  "SORTIE_APRES_REMISE_COLIS_PAYE_COO",
  "SORTIE_APRES_REMISE_ACHEMINEMENT",
  "SORTIE_POUR_ACHEMINEMENT"
] as const;

export type StorageExitPeriod = "today" | "yesterday" | "week" | "month" | "year" | "custom";

export type StorageExitEvent = {
  event_id: string;
  event_type: string;
  agency: string;
  tracking_code: string | null;
  parcel_count_delta: number;
  weight_kg_delta: number;
  occurred_at: string;
  business_date: string;
  source_type: string | null;
  source_request_id: string | null;
  metadata: Record<string, unknown> | null;
};

export type StorageExitCorrection = {
  event_id: string;
  target_event_id: string;
  agency: string;
  occurred_at: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
};

export type StorageExitParcelLink = {
  delivered_event_id: string;
  parcel_id: string;
  forwarding_id: string | null;
  agency: string;
  tracking_code: string;
};

export type StorageExitForwardingLink = {
  forwarding_id: string;
  forwarding_reference: string;
  original_tracking_code: string;
  origin_agency: string;
  destination_agency: string;
};

export type StorageExitRow = {
  eventId: string;
  parcelId: string | null;
  forwardingId: string | null;
  agency: string;
  trackingCode: string;
  weightKg: number | null;
  occurredAt: string;
  businessDate: string;
  type: "LIVRAISON_REMISE" | "ACHEMINEMENT";
  correction: "NONE" | "ADJUSTED" | "CANCELLED" | "AMBIGUOUS";
  correctionReason: string | null;
  countedWeightKg: number | null;
};

export function portoNovoDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Porto-Novo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function portoNovoMidnight(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Porto-Novo", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  let instant = localMidnightAsUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    const localAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
    instant = localMidnightAsUtc - (localAsUtc - instant);
  }
  return new Date(instant).toISOString();
}

export function resolveStorageExitPeriod(
  period: StorageExitPeriod,
  options: { now?: Date; year?: number; from?: string; to?: string } = {}
): { fromDate: string; toDate: string; fromIso: string; toExclusiveIso: string } {
  const today = portoNovoDateKey(options.now ?? new Date());
  let fromDate: string;
  let toDate: string;
  if (period === "today") fromDate = toDate = today;
  else if (period === "yesterday") fromDate = toDate = addDays(today, -1);
  else if (period === "week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    fromDate = addDays(today, -((weekday + 6) % 7));
    toDate = addDays(fromDate, 6);
  } else if (period === "month") {
    fromDate = `${today.slice(0, 7)}-01`;
    toDate = addDays(`${today.slice(0, 7)}-01`, 32).slice(0, 7) + "-01";
    toDate = addDays(toDate, -1);
  } else if (period === "year") {
    if (!Number.isInteger(options.year) || Number(options.year) < 2000 || Number(options.year) > 2100) throw new Error("INVALID_YEAR");
    fromDate = `${options.year}-01-01`;
    toDate = `${options.year}-12-31`;
  } else if (period === "custom") {
    fromDate = options.from ?? "";
    toDate = options.to ?? "";
    if (!validDay(fromDate) || !validDay(toDate) || fromDate > toDate) throw new Error("INVALID_DATE_RANGE");
  } else throw new Error("INVALID_PERIOD");
  return { fromDate, toDate, fromIso: portoNovoMidnight(fromDate), toExclusiveIso: portoNovoMidnight(addDays(toDate, 1)) };
}

export async function readAllStorageExitPages<T>(
  fetchPage: (from: number, to: number) => Promise<readonly T[]>,
  identity: (row: T) => string,
  pageSize = 1000
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("INVALID_PAGE_SIZE");
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, offset + pageSize - 1);
    if (page.length > pageSize) throw new Error("PAGE_OVERFLOW");
    for (const row of page) {
      const id = identity(row);
      if (!id || seen.has(id)) throw new Error("DUPLICATE_EVENT_ID");
      seen.add(id);
      rows.push(row);
    }
    if (page.length < pageSize) return rows;
  }
}

export function buildStorageExitReport(input: {
  agency: string;
  events: readonly StorageExitEvent[];
  corrections: readonly StorageExitCorrection[];
  parcels: readonly StorageExitParcelLink[];
  forwardings: readonly StorageExitForwardingLink[];
  page: number;
  pageSize: number;
}) {
  const corrections = new Map<string, StorageExitCorrection[]>();
  for (const correction of input.corrections) {
    const list = corrections.get(correction.target_event_id) ?? [];
    list.push(correction);
    corrections.set(correction.target_event_id, list);
  }
  const parcels = new Map(input.parcels.map((row) => [row.delivered_event_id, row]));
  const forwardings = new Map(input.forwardings.map((row) => [row.forwarding_id, row]));
  const seen = new Set<string>();
  const issues: string[] = [];
  let count = 0;
  let weightGrams = 0;
  const rows: StorageExitRow[] = [];
  for (const event of input.events) {
    if (seen.has(event.event_id)) throw new Error("DUPLICATE_EVENT_ID");
    seen.add(event.event_id);
    if (event.agency !== input.agency || !STORAGE_EXIT_TYPES.includes(event.event_type as typeof STORAGE_EXIT_TYPES[number])) throw new Error("EXIT_SCOPE_CONFLICT");
    const related = corrections.get(event.event_id) ?? [];
    const parcel = parcels.get(event.event_id);
    const metadata = event.metadata ?? {};
    const forwardingId = event.source_type === "INTER_AGENCY_FORWARDING"
      ? String(metadata.forwardingId ?? event.source_request_id ?? "") || null
      : parcel?.forwarding_id ?? null;
    const forwarding = forwardingId ? forwardings.get(forwardingId) : undefined;
    const code = event.tracking_code?.trim() ?? "";
    const originalWeight = -Number(event.weight_kg_delta);
    const validBase = Boolean(code) && event.parcel_count_delta === -1 && Number.isFinite(originalWeight) && originalWeight > 0
      && Number.isFinite(Date.parse(event.occurred_at))
      && (!parcel || (parcel.agency === event.agency && parcel.tracking_code === code))
      && (event.source_type !== "INTER_AGENCY_FORWARDING" || Boolean(forwarding &&
        (event.event_type === "SORTIE_POUR_ACHEMINEMENT"
          ? forwarding.origin_agency === event.agency
          : forwarding.destination_agency === event.agency) &&
        (forwarding.original_tracking_code === code || forwarding.forwarding_reference === code)));
    let correction: StorageExitRow["correction"] = "NONE";
    let countedWeightKg: number | null = validBase ? originalWeight : null;
    if (!validBase || related.length > 1 || related.some((item) => item.agency !== event.agency)) {
      correction = "AMBIGUOUS";
      countedWeightKg = null;
      issues.push(`Sortie ${event.event_id} : identité, poids ou correction non certifiable.`);
    } else if (related.length === 1) {
      const details = related[0].metadata ?? {};
      const correctedCount = typeof details.correctedParcelDelta === "number" ? details.correctedParcelDelta : Number.NaN;
      const correctedWeight = typeof details.correctedWeightDelta === "number" ? details.correctedWeightDelta : Number.NaN;
      if (correctedCount === 0 && correctedWeight === 0) {
        correction = "CANCELLED";
        countedWeightKg = 0;
      } else if (correctedCount === -1 && Number.isFinite(correctedWeight) && correctedWeight < 0) {
        correction = "ADJUSTED";
        countedWeightKg = -correctedWeight;
      } else {
        correction = "AMBIGUOUS";
        countedWeightKg = null;
        issues.push(`Sortie ${event.event_id} : portée de la correction non certifiable.`);
      }
    }
    if (countedWeightKg !== null && correction !== "CANCELLED") { count += 1; weightGrams += Math.round(countedWeightKg * 1000); }
    rows.push({
      eventId: event.event_id,
      parcelId: parcel?.parcel_id ?? (typeof metadata.parcelId === "string" ? metadata.parcelId : null),
      forwardingId,
      agency: event.agency,
      trackingCode: code,
      weightKg: validBase ? originalWeight : null,
      occurredAt: event.occurred_at,
      businessDate: event.business_date,
      type: event.event_type === "SORTIE_POUR_ACHEMINEMENT" ? "ACHEMINEMENT" : "LIVRAISON_REMISE",
      correction,
      correctionReason: related.length === 1 ? related[0].reason : null,
      countedWeightKg
    });
  }
  rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.eventId.localeCompare(a.eventId));
  const complete = issues.length === 0;
  const start = (input.page - 1) * input.pageSize;
  return {
    items: rows.slice(start, start + input.pageSize),
    pagination: { page: input.page, pageSize: input.pageSize, total: rows.length, totalPages: Math.ceil(rows.length / input.pageSize) },
    summary: { complete, count: complete ? count : null, weightKg: complete ? weightGrams / 1000 : null, issues }
  };
}
