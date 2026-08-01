export const SHIPMENT_STATISTICS_SHEET = "STATISTIQUES DES EXPÉDITIONS";

export type ShipmentStatisticRow = {
  id: string; date: string; company: string; destination: string; groupages: number;
  weightKg: number; groupageCodes: string; pricePerKg: number; amountUsd: number;
  groupageWeights: string; manifestTotal: string; status: string; arrivalDate: string;
  arrivedGroupages: string; klzPackages: string; parcelCount: number | null;
};

export type ShipmentStatistics = {
  shipments: ShipmentStatisticRow[];
  totals: { shipments: number; groupages: number; weightKg: number; amountUsd: number; parcels: number };
  byCompany: Array<{ label: string; shipments: number; weightKg: number }>;
  byDestination: Array<{ label: string; shipments: number; weightKg: number }>;
};

export function parseShipmentStatistics(rows: unknown[][]): ShipmentStatistics {
  const shipments = rows.slice(1).flatMap((row, index) => {
    const date = normalizeDate(row[0]);
    const company = text(row[1]).toUpperCase();
    if (!date || !company) return [];
    return [{
      id: `${date}-${company}-${index + 2}`,
      date,
      company,
      destination: text(row[2]).toUpperCase(),
      groupages: number(row[3]),
      weightKg: number(row[4]),
      groupageCodes: text(row[5]),
      pricePerKg: number(row[6]),
      amountUsd: number(row[7]),
      groupageWeights: text(row[8]),
      manifestTotal: text(row[9]),
      status: text(row[10]),
      arrivalDate: normalizeDate(row[11]) ?? "",
      arrivedGroupages: text(row[12]),
      klzPackages: text(row[13]),
      parcelCount: parseParcelCount(row[9], row[13])
    } satisfies ShipmentStatisticRow];
  });
  return summarizeShipments(shipments);
}

export function filterShipmentStatistics(rows: ShipmentStatisticRow[], filters: { from?: string; to?: string; company?: string; destination?: string; status?: string; arrival?: string; search?: string }) {
  const search = normalize(filters.search);
  return summarizeShipments(rows.filter((row) =>
    (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to) &&
    (!filters.company || filters.company === "ALL" || row.company === filters.company) &&
    (!filters.destination || filters.destination === "ALL" || row.destination === filters.destination) &&
    (!filters.status || filters.status === "ALL" || normalize(row.status) === filters.status) &&
    (!filters.arrival || filters.arrival === "ALL" || (filters.arrival === "ARRIVED" ? Boolean(row.arrivedGroupages || row.arrivalDate) : !row.arrivedGroupages && !row.arrivalDate)) &&
    (!search || normalize(`${row.groupageCodes} ${row.arrivedGroupages}`).includes(search))
  ));
}

function summarizeShipments(shipments: ShipmentStatisticRow[]): ShipmentStatistics {
  const aggregate = (key: "company" | "destination") => Array.from(shipments.reduce((map, row) => {
    const label = row[key] || "NON RENSEIGNÉ";
    const current = map.get(label) ?? { label, shipments: 0, weightKg: 0 };
    current.shipments += 1; current.weightKg += row.weightKg; map.set(label, current); return map;
  }, new Map<string, { label: string; shipments: number; weightKg: number }>()).values()).sort((a, b) => a.label.localeCompare(b.label));
  return {
    shipments,
    totals: shipments.reduce((total, row) => ({ shipments: total.shipments + 1, groupages: total.groupages + row.groupages, weightKg: total.weightKg + row.weightKg, amountUsd: total.amountUsd + row.amountUsd, parcels: total.parcels + (row.parcelCount ?? 0) }), { shipments: 0, groupages: 0, weightKg: 0, amountUsd: 0, parcels: 0 }),
    byCompany: aggregate("company"), byDestination: aggregate("destination")
  };
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : String(value ?? "").trim(); }
function number(value: unknown) { const parsed = Number(text(value).replace(/[^\d,.-]/g, "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function normalizeDate(value: unknown) {
  const raw = text(value); const match = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (match) { const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : String(new Date().getFullYear()); return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}
function parseParcelCount(...values: unknown[]) { for (const value of values) { const match = text(value).match(/(\d+)\s*(?:COLIS|PCS)/i); if (match) return Number(match[1]); } return null; }
function normalize(value: unknown) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
