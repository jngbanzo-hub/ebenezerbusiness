export const PARCEL_STATUSES = ["WAITING_COO", "IN_FLIGHT", "IN_TRANSIT", "ARRIVED", "DELIVERED"] as const;
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];
export const PARCEL_STATUS_LABELS: Record<ParcelStatus, string> = {
  WAITING_COO: "En attente à COO",
  IN_FLIGHT: "En vol",
  IN_TRANSIT: "En transit",
  ARRIVED: "Arrivé",
  DELIVERED: "Livré"
};
export type ParcelDestination = "FIH" | "LSHI" | "KLZ";

export type RawParcelStatusRow = {
  destination: ParcelDestination;
  rowNumber: number;
  dateRaw: unknown;
  codeRaw: unknown;
  weightRaw: unknown;
  statusRaw: unknown;
};

export type ParcelStatusRow = {
  destination: ParcelDestination;
  rowNumber: number;
  date: string;
  code: string;
  weightKg: number | null;
  status: ParcelStatus | null;
  rawStatus: string;
};

export type ParcelStatusFilters = {
  month?: number;
  fromMonth?: string;
  toMonth?: string;
  destination?: ParcelDestination | "ALL";
  status?: ParcelStatus | "ALL";
};

type StatusMetric = { parcels: number; weightKg: number };
type DestinationSituation = Record<ParcelStatus, StatusMetric> & { total: StatusMetric };

export type ParcelStatusSituation = {
  rows: ParcelStatusRow[];
  destinations: Record<ParcelDestination, DestinationSituation>;
  global: DestinationSituation;
  anomalies: {
    invalidDates: number;
    emptyCodes: number;
    duplicateCodes: number;
    invalidWeights: number;
    unknownStatuses: number;
    unknownStatusValues: Array<{ destination: ParcelDestination; value: string; count: number }>;
    excludedRows: Array<{ destination: ParcelDestination; rowNumber: number; reason: "INVALID_DATE" | "EMPTY_CODE" | "INVALID_WEIGHT" }>;
  };
};

export type ParcelMonthlyStatistics = {
  month: string;
  year: number;
  fih: number;
  lshi: number;
  klz: number;
  total: number;
};

export function normalizeParcelStatus(value: unknown): ParcelStatus | null {
  const normalized = normalizeText(value);
  if (["EN ATTENTE", "ENREGISTRE", "DEPOSE"].includes(normalized)) return "WAITING_COO";
  if (normalized === "EN VOL") return "IN_FLIGHT";
  if (normalized === "EN TRANSIT") return "IN_TRANSIT";
  if (normalized === "ARRIVE") return "ARRIVED";
  if (normalized === "LIVRE") return "DELIVERED";
  return null;
}

export function buildParcelStatusSituation(rawRows: RawParcelStatusRow[], filters: ParcelStatusFilters = {}): ParcelStatusSituation {
  const rowsBySource: ParcelStatusRow[] = [];
  const allExcludedRows: Array<ParcelStatusSituation["anomalies"]["excludedRows"][number] & { date: string | null }> = [];

  for (const raw of rawRows) {
    if (![raw.dateRaw, raw.codeRaw, raw.weightRaw, raw.statusRaw].some((value) => String(value ?? "").trim())) continue;
    const date = normalizeDate(raw.dateRaw);
    if (!date) { allExcludedRows.push({ destination: raw.destination, rowNumber: raw.rowNumber, reason: "INVALID_DATE", date: null }); continue; }
    const code = normalizeCode(raw.codeRaw);
    if (!code || code === "CODE COLIS") { allExcludedRows.push({ destination: raw.destination, rowNumber: raw.rowNumber, reason: "EMPTY_CODE", date }); continue; }
    const weightKg = normalizeWeight(raw.weightRaw);
    if (weightKg === null) { allExcludedRows.push({ destination: raw.destination, rowNumber: raw.rowNumber, reason: "INVALID_WEIGHT", date }); continue; }
    const candidate: ParcelStatusRow = {
      destination: raw.destination,
      rowNumber: raw.rowNumber,
      date,
      code,
      weightKg,
      status: normalizeParcelStatus(raw.statusRaw),
      rawStatus: String(raw.statusRaw ?? "").trim()
    };
    rowsBySource.push(candidate);
  }

  const rows = rowsBySource.filter((row) =>
    (!filters.month || Number(row.date.slice(5, 7)) === filters.month) &&
    (!filters.fromMonth || row.date.slice(0, 7) >= filters.fromMonth) &&
    (!filters.toMonth || row.date.slice(0, 7) <= filters.toMonth) &&
    (!filters.destination || filters.destination === "ALL" || row.destination === filters.destination) &&
    (!filters.status || filters.status === "ALL" || row.status === filters.status)
  );
  const excludedRows = allExcludedRows.filter((row) =>
    (!filters.destination || filters.destination === "ALL" || row.destination === filters.destination) &&
    (row.date === null ? !filters.month && !filters.fromMonth && !filters.toMonth :
      (!filters.month || Number(row.date.slice(5, 7)) === filters.month) &&
      (!filters.fromMonth || row.date.slice(0, 7) >= filters.fromMonth) &&
      (!filters.toMonth || row.date.slice(0, 7) <= filters.toMonth))
  ).map(({ date: _date, ...row }) => row);
  const seenCodes = new Set<string>();
  const duplicateCodes = new Set<string>();
  for (const row of rows) { if (seenCodes.has(row.code)) duplicateCodes.add(row.code); seenCodes.add(row.code); }
  const unknowns = new Map<string, { destination: ParcelDestination; value: string; count: number }>();
  for (const row of rows) if (!row.status) {
    const value = row.rawStatus || "(vide)"; const key = `${row.destination}:${value}`;
    const current = unknowns.get(key) ?? { destination: row.destination, value, count: 0 }; current.count += 1; unknowns.set(key, current);
  }
  const destinations: Record<ParcelDestination, DestinationSituation> = { FIH: emptySituation(), LSHI: emptySituation(), KLZ: emptySituation() };
  const global = emptySituation();
  for (const row of rows) {
    if (row.weightKg === null) continue;
    addTotalMetric(destinations[row.destination], row.weightKg);
    addTotalMetric(global, row.weightKg);
    if (row.status) {
      addStatusMetric(destinations[row.destination], row.status, row.weightKg);
      addStatusMetric(global, row.status, row.weightKg);
    }
  }
  return {
    rows,
    destinations,
    global,
    anomalies: { invalidDates: excludedRows.filter((row) => row.reason === "INVALID_DATE").length, emptyCodes: excludedRows.filter((row) => row.reason === "EMPTY_CODE").length, duplicateCodes: duplicateCodes.size, invalidWeights: excludedRows.filter((row) => row.reason === "INVALID_WEIGHT").length, unknownStatuses: Array.from(unknowns.values()).reduce((sum, row) => sum + row.count, 0), unknownStatusValues: Array.from(unknowns.values()).sort((a, b) => a.destination.localeCompare(b.destination) || a.value.localeCompare(b.value)), excludedRows }
  };
}

export function buildManifestStatisticsFromParcelRows(rows: ParcelStatusRow[]) {
  const monthly = new Map<string, { kilograms: ParcelMonthlyStatistics; parcels: ParcelMonthlyStatistics }>();
  for (const row of rows) {
    if (row.weightKg === null) continue;
    const month = row.date.slice(0, 7);
    const current = monthly.get(month) ?? { kilograms: emptyMonthly(month), parcels: emptyMonthly(month) };
    const key = row.destination.toLowerCase() as "fih" | "lshi" | "klz";
    current.parcels[key] += 1;
    current.parcels.total += 1;
    current.kilograms[key] += row.weightKg;
    current.kilograms.total += row.weightKg;
    monthly.set(month, current);
  }
  const ordered = Array.from(monthly.entries()).sort(([left], [right]) => left.localeCompare(right));
  const kilograms = ordered.map(([, value]) => value.kilograms);
  const parcels = ordered.map(([, value]) => value.parcels);
  return { kilograms, parcels, annualKilograms: sumMonthly(kilograms), annualParcels: sumMonthly(parcels) };
}

function emptyMetric(): StatusMetric { return { parcels: 0, weightKg: 0 }; }
function emptyMonthly(month: string): ParcelMonthlyStatistics { return { month, year: Number(month.slice(0, 4)), fih: 0, lshi: 0, klz: 0, total: 0 }; }
function sumMonthly(rows: ParcelMonthlyStatistics[]): ParcelMonthlyStatistics | null { if (!rows.length) return null; return rows.reduce((total, row) => ({ month: "TOTAL FILTRÉ", year: row.year, fih: total.fih + row.fih, lshi: total.lshi + row.lshi, klz: total.klz + row.klz, total: total.total + row.total }), { month: "TOTAL FILTRÉ", year: rows[0].year, fih: 0, lshi: 0, klz: 0, total: 0 }); }
function emptySituation(): DestinationSituation { return { WAITING_COO: emptyMetric(), IN_FLIGHT: emptyMetric(), IN_TRANSIT: emptyMetric(), ARRIVED: emptyMetric(), DELIVERED: emptyMetric(), total: emptyMetric() }; }
function addTotalMetric(target: DestinationSituation, weight: number) { target.total.parcels += 1; target.total.weightKg += weight; }
function addStatusMetric(target: DestinationSituation, status: ParcelStatus, weight: number) { target[status].parcels += 1; target[status].weightKg += weight; }
function normalizeText(value: unknown) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function normalizeCode(value: unknown) { return String(value ?? "").trim().toUpperCase().replace(/\s+/g, ""); }
function normalizeWeight(value: unknown) { const normalized = String(value ?? "").replace(/KGS?/gi, "").replace(/\s/g, "").replace(",", "."); if (!normalized) return null; const parsed = Number(normalized); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function normalizeDate(value: unknown) { if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10); const raw = String(value ?? "").trim(); const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw); if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3])); const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!match) return null; return validDate(Number(match[3].length === 2 ? `20${match[3]}` : match[3]), Number(match[2]), Number(match[1])); }
function validDate(year: number, month: number, day: number) { const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null; }
