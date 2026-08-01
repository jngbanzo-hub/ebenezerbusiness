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

export function filterManifestStatistics(statistics: ManifestStatistics, year?: number, month?: number) {
  const filter = (rows: ManifestMonthlyStatistic[]) => rows.filter((row) => {
    const parsed = parseMonthYear(row.month);
    return (!year || row.year === year) && (!month || parsed?.month === month);
  });
  return { ...statistics, kilograms: filter(statistics.kilograms), parcels: filter(statistics.parcels) };
}
