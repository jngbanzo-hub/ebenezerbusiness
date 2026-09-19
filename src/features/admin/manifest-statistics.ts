export const MANIFEST_STATISTICS_SHEET = "STATISTIQUES DU MANIFESTES";

export type ManifestMonthlyStatistic = {
  month: string;
  year: number;
  fih: number;
  lshi: number;
  klz: number;
  total: number;
};

export type ManifestStatistics = {
  kilograms: ManifestMonthlyStatistic[];
  parcels: ManifestMonthlyStatistic[];
  annualKilograms: ManifestMonthlyStatistic | null;
  annualParcels: ManifestMonthlyStatistic | null;
};

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12
};

export function parseManifestStatistics(rows: unknown[][]): ManifestStatistics {
  return {
    kilograms: parseMonthlySection(rows, 10, 21),
    parcels: parseMonthlySection(rows, 74, 85),
    annualKilograms: parseAnnualRow(rows[21]),
    annualParcels: parseAnnualRow(rows[85])
  };
}

function parseMonthlySection(rows: unknown[][], fromRow: number, toRow: number) {
  const result: ManifestMonthlyStatistic[] = [];
  for (let rowNumber = fromRow; rowNumber <= toRow; rowNumber += 1) {
    const row = rows[rowNumber - 1] ?? [];
    const parsedMonth = parseMonthYear(row[0]);
    if (!parsedMonth) continue;
    const values = [row[1], row[2], row[3], row[4]].map(toNumber);
    result.push({ month: parsedMonth.label, year: parsedMonth.year, fih: values[0], lshi: values[1], klz: values[2], total: values[3] });
  }
  return result;
}

function parseAnnualRow(row: unknown[] | undefined): ManifestMonthlyStatistic | null {
  if (!row || !String(row[0] ?? "").toUpperCase().includes("TOTAL")) return null;
  const values = [row[1], row[2], row[3], row[4]].map(toNumber);
  return { month: "TOTAL ANNUEL", year: new Date().getFullYear(), fih: values[0], lshi: values[1], klz: values[2], total: values[3] };
}

function parseMonthYear(value: unknown) {
  const label = String(value ?? "").trim();
  const match = label.toLocaleLowerCase("fr").match(/^([^\d]+)\s+(\d{4})$/);
  if (!match || !MONTHS[match[1].trim()]) return null;
  return { label, month: MONTHS[match[1].trim()], year: Number(match[2]) };
}

function toNumber(value: unknown) {
  const normalized = String(value ?? "0").replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function filterManifestStatistics(statistics: ManifestStatistics, filters: { year?: number; month?: number; fromMonth?: string; toMonth?: string } = {}) {
  const filter = (rows: ManifestMonthlyStatistic[]) => rows.filter((row) => {
    const parsed = parseMonthYear(row.month);
    const key = parsed ? `${row.year}-${String(parsed.month).padStart(2, "0")}` : "";
    return (!filters.year || row.year === filters.year) && (!filters.month || parsed?.month === filters.month) && (!filters.fromMonth || key >= filters.fromMonth) && (!filters.toMonth || key <= filters.toMonth);
  });
  const kilograms = filter(statistics.kilograms); const parcels = filter(statistics.parcels);
  return { kilograms, parcels, annualKilograms: sumRows(kilograms), annualParcels: sumRows(parcels) };
}

function sumRows(rows: ManifestMonthlyStatistic[]): ManifestMonthlyStatistic | null { if (!rows.length) return null; return rows.reduce((total, row) => ({ month: "TOTAL FILTRÉ", year: row.year, fih: total.fih + row.fih, lshi: total.lshi + row.lshi, klz: total.klz + row.klz, total: total.total + row.total }), { month: "TOTAL FILTRÉ", year: rows[0].year, fih: 0, lshi: 0, klz: 0, total: 0 }); }
