import type { BilanAgency, ShipmentContext } from "./bilan-contracts";
import type {
  BilanManifestParcel,
  BilanOfficialTransitRow,
  BilanRangeReader,
  BilanReadAnomaly,
  BilanReadResult,
  BilanShipment
} from "./bilan-readers-contracts";
import { canonicalParcelCode } from "./cohort-registry";
import { parseShipmentGroups } from "./shipment-groups";

const MANIFEST_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;

export async function readBilanManifestParcels(source: BilanRangeReader, agency: BilanAgency) {
  return readSafely(() => source.read({ spreadsheet: "MANIFESTE_EXPEDITION_COO", range: `${agency}!A2:F` }), agency, (rows) => adaptManifestParcelRows(rows, agency, 2));
}

export function adaptManifestParcelRows(rows: readonly (readonly unknown[])[], agency: BilanAgency, firstRow = 2): BilanReadResult<BilanManifestParcel> {
  const result: BilanManifestParcel[] = [];
  const anomalies: BilanReadAnomaly[] = [];
  rows.forEach((row, index) => {
    const sourceRow = firstRow + index;
    if (!isMeaningfulManifestParcelRow(row)) return;
    const date = sheetDate(row[0]);
    const rawCode = text(row[1]);
    const code = canonicalParcelCode(rawCode);
    const weightKg = numeric(row[4]);
    if (!date) anomalies.push(anomaly("CHAMP_MANQUANT", agency, sourceRow, "Date absente ou invalide."));
    if (!code) anomalies.push(anomaly("CODE_ABSENT", agency, sourceRow, "Code colis absent."));
    if (weightKg === null || weightKg <= 0) anomalies.push(anomaly("POIDS_INVALIDE", agency, sourceRow, "Poids colonne E absent ou invalide."));
    if (!date || !code || weightKg === null || weightKg <= 0) return;
    result.push(Object.freeze({ date, rawCode, code, weightKg, expectedAmount: nonNegative(row[5]), agency, sourceSheet: agency, sourceRow }));
  });
  return freezeResult(result, anomalies);
}

export async function readBilanShipments(source: BilanRangeReader) {
  return readSafely(() => source.read({ spreadsheet: "MANIFESTE_EXPEDITION_COO", range: "EXPÉDITION!A2:F" }), "EXPÉDITION", (rows) => adaptShipmentRows(rows, 2));
}

export function adaptShipmentRows(rows: readonly (readonly unknown[])[], firstRow = 2): BilanReadResult<BilanShipment> {
  const result: BilanShipment[] = [];
  const anomalies: BilanReadAnomaly[] = [];
  rows.forEach((row, index) => {
    const sourceRow = firstRow + index;
    if (!isMeaningfulShipmentRow(row)) return;
    const date = sheetDate(row[0]);
    const company = text(row[1]).toUpperCase();
    const destination = agency(row[2]);
    const details = text(row[5]);
    if (!date || !company || !destination || !details) {
      anomalies.push(anomaly("CHAMP_MANQUANT", "EXPÉDITION", sourceRow, "Date, compagnie, destination ou détails manquants."));
      return;
    }
    const context: ShipmentContext = { company, destination, shipmentDate: date, sourceSheet: "EXPÉDITION", sourceRow };
    const parsed = parseShipmentGroups(details, context);
    for (const parsedAnomaly of parsed.anomalies) {
      if (parsedAnomaly.code === "POIDS_ABSENT") anomalies.push(anomaly("POIDS_INVALIDE", "EXPÉDITION", sourceRow, parsedAnomaly.message));
      if (parsedAnomaly.code === "GROUPAGE_NON_SEGMENTABLE") anomalies.push(anomaly("GROUPAGE_NON_SEGMENTABLE", "EXPÉDITION", sourceRow, parsedAnomaly.message));
    }
    result.push(Object.freeze({ date, company, destination, sourceSheet: "EXPÉDITION", sourceRow, groups: parsed.groups }));
  });
  return freezeResult(result, anomalies);
}

export async function readBilanOfficialTransit(source: BilanRangeReader) {
  return readSafely(() => source.read({ spreadsheet: "MANIFESTE_PUBLIC", range: "'STATISTIQUES DES EXPÉDITIONS'!A2:F" }), "STATISTIQUES DES EXPÉDITIONS", (rows) => adaptOfficialTransitRows(rows, 2));
}

export function adaptOfficialTransitRows(rows: readonly (readonly unknown[])[], firstRow = 2): BilanReadResult<BilanOfficialTransitRow> {
  const result: BilanOfficialTransitRow[] = [];
  const anomalies: BilanReadAnomaly[] = [];
  rows.forEach((row, index) => {
    const sourceRow = firstRow + index;
    const company = text(row[1]).toUpperCase();
    const destination = text(row[2]).toUpperCase();
    if (company !== "DHL" || destination !== "LSHI") return;
    const date = sheetDate(row[0]);
    const officialWeightKg = numeric(row[4]);
    if (!date) anomalies.push(anomaly("CHAMP_MANQUANT", "STATISTIQUES DES EXPÉDITIONS", sourceRow, "Date absente ou invalide."));
    if (officialWeightKg === null || officialWeightKg <= 0) anomalies.push(anomaly("POIDS_INVALIDE", "STATISTIQUES DES EXPÉDITIONS", sourceRow, "Poids officiel colonne E invalide."));
    if (!date || officialWeightKg === null || officialWeightKg <= 0) return;
    const details = text(row[5]).toUpperCase();
    result.push(Object.freeze({
      date,
      company: "DHL",
      destination: "LSHI",
      groupIdentifiers: Object.freeze(Array.from(details.matchAll(/(?:GROUPAGE|GRP)\s*[- ]?\s*\d+/g), (match) => match[0].replace(/\s+/g, " "))),
      officialWeightKg,
      parcelCodes: Object.freeze(extractParcelCodes(details)),
      sourceSheet: "STATISTIQUES DES EXPÉDITIONS",
      sourceRow
    }));
  });
  return freezeResult(result, anomalies);
}

export type ShipmentTransitMatch = Readonly<{ official: BilanOfficialTransitRow; shipment: BilanShipment }>;

export function reconcileOfficialTransit(
  officialRows: readonly BilanOfficialTransitRow[],
  shipments: readonly BilanShipment[]
): Readonly<{ matches: readonly ShipmentTransitMatch[]; ambiguous: readonly BilanOfficialTransitRow[]; missing: readonly BilanOfficialTransitRow[] }> {
  const matches: ShipmentTransitMatch[] = [];
  const ambiguous: BilanOfficialTransitRow[] = [];
  const missing: BilanOfficialTransitRow[] = [];
  for (const official of officialRows) {
    const candidates = shipments.filter((shipment) =>
      shipment.date === official.date && shipment.company === official.company && shipment.destination === official.destination &&
      sameIdentifiers(official.groupIdentifiers, shipment.groups.map((group) => group.canonicalLabel))
    );
    if (candidates.length === 1) matches.push(Object.freeze({ official, shipment: candidates[0] }));
    else if (candidates.length > 1) ambiguous.push(official);
    else missing.push(official);
  }
  return Object.freeze({ matches: Object.freeze(matches), ambiguous: Object.freeze(ambiguous), missing: Object.freeze(missing) });
}

function sameIdentifiers(left: readonly string[], right: readonly string[]) {
  if (!left.length || left.length !== right.length) return false;
  const normalized = (values: readonly string[]) => [...values].map((value) => value.toUpperCase().replace(/\s+/g, " ")).sort();
  return normalized(left).every((value, index) => value === normalized(right)[index]);
}

function extractParcelCodes(value: string) {
  const matches = value.match(/[A-Z]{1,10}[ \t]*-?[ \t]*\d{2,}(?:[ \t]*[A-Z]{1,5})?/g) ?? [];
  return Array.from(new Set(matches.map(canonicalParcelCode).filter((code) => !/^(?:GROUPAGE|GRP)\d+$/.test(code))));
}

function agency(value: unknown): BilanAgency | null {
  const normalized = text(value).toUpperCase();
  return MANIFEST_AGENCIES.includes(normalized as BilanAgency) ? normalized as BilanAgency : null;
}

function sheetDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(Math.round((value - 25569) * 86_400_000)).toISOString().slice(0, 10);
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
}

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(text(value).replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value: unknown) { const parsed = numeric(value); return parsed !== null && parsed >= 0 ? parsed : null; }
function text(value: unknown) { return String(value ?? "").trim(); }
export function isMeaningfulManifestParcelRow(row: readonly unknown[]) {
  const date = text(row[0]);
  const code = text(row[1]);
  const weight = numeric(row[4]);
  const expectedAmount = numeric(row[5]);
  return Boolean(date || code || (weight !== null && weight !== 0) || (expectedAmount !== null && expectedAmount !== 0));
}
export function isMeaningfulShipmentRow(row: readonly unknown[]) {
  return Boolean(text(row[0]) || text(row[1]) || text(row[2]) || text(row[5]));
}
function anomaly(code: BilanReadAnomaly["code"], source: string, rowNumber: number, message: string): BilanReadAnomaly { return Object.freeze({ code, source, rowNumber, message }); }
function freezeResult<T>(rows: T[], anomalies: BilanReadAnomaly[]): BilanReadResult<T> { return Object.freeze({ rows: Object.freeze(rows), anomalies: Object.freeze(anomalies) }); }
async function readSafely<T>(
  read: () => Promise<readonly (readonly unknown[])[]>,
  source: string,
  adapt: (rows: readonly (readonly unknown[])[]) => BilanReadResult<T>
): Promise<BilanReadResult<T>> {
  try { return adapt(await read()); }
  catch { return freezeResult([], [Object.freeze({ code: "SOURCE_INDISPONIBLE", source, message: "Source de lecture BILAN indisponible." })]); }
}
