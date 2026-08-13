export const SHIPMENT_TRACKING_SHEET = "EXPÉDITION";

export const SHIPMENT_STATUSES = [
  "En Attente",
  "Non Reçu",
  "En Vol",
  "En Transit à Addis",
  "En Transit à Lagos",
  "En Transit à Libreville",
  "En Transit à Brazzaville",
  "En Transit à Lubumbashi",
  "Arrivé"
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export type ShipmentTrackingRow = {
  id: string;
  identity: string;
  rowNumber: number;
  date: string;
  company: string;
  destination: string;
  groupage: string;
  totalWeight: string;
  manifestWeight: string;
  parcelCount: string;
  status: string;
};

export function parseShipmentTrackingRows(rows: unknown[][]): ShipmentTrackingRow[] {
  return rows.slice(1).flatMap((row, index) => {
    const date = text(row[0]);
    const company = text(row[1]);
    if (!date && !company) return [];
    const rowNumber = index + 2;
    const destination = text(row[2]);
    const groupage = text(row[5]);
    const identity = createShipmentIdentity({ date, company, destination, groupage });
    return [{
      id: `${rowNumber}:${identity}`,
      identity,
      rowNumber,
      date,
      company,
      destination,
      groupage,
      totalWeight: text(row[4]),
      manifestWeight: text(row[9]) || text(row[8]),
      parcelCount: parseParcelCount(row[9], row[13]),
      status: text(row[10])
    }];
  });
}

export function filterShipmentTrackingRows(rows: ShipmentTrackingRow[], filters: { from?: string; to?: string; company?: string; destination?: string; status?: string; search?: string }) {
  const search = normalize(filters.search);
  return rows.filter((row) => {
    const date = normalizeDate(row.date);
    return (!filters.from || Boolean(date && date >= filters.from)) &&
      (!filters.to || Boolean(date && date <= filters.to)) &&
      (!filters.company || filters.company === "ALL" || normalize(row.company) === normalize(filters.company)) &&
      (!filters.destination || filters.destination === "ALL" || normalize(row.destination) === normalize(filters.destination)) &&
      (!filters.status || filters.status === "ALL" || row.status === filters.status) &&
      (!search || normalize(row.groupage).includes(search));
  });
}

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
  return typeof value === "string" && SHIPMENT_STATUSES.includes(value as ShipmentStatus);
}

export function createShipmentIdentity(fields: Pick<ShipmentTrackingRow, "date" | "company" | "destination" | "groupage">) {
  return [fields.date, fields.company, fields.destination, fields.groupage].map(normalize).join("|");
}

function text(value: unknown) { return String(value ?? "").trim(); }
function normalize(value: unknown) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim(); }
function normalizeDate(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) return `${match[3].length === 2 ? "20" : ""}${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}
function parseParcelCount(...values: unknown[]) { for (const value of values) { const match = text(value).match(/(\d+)\s*(?:COLIS|PCS)/i); if (match) return match[1]; } return ""; }
