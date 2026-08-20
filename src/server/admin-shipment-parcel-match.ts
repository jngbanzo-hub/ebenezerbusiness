import type { ShipmentStatisticRow } from "@/features/admin/shipment-statistics";

export type AdminShipmentParcelMatch = {
  id: string;
  agency: string;
  code: string;
  date: string;
  company: string;
  destination: string;
  groupage: string;
  status: string;
  arrivalDate: string;
  isLatestForAgency: boolean;
};

export function findShipmentParcelMatches(rows: ShipmentStatisticRow[], searchedCode: string): AdminShipmentParcelMatch[] {
  const target = normalizeCode(searchedCode);
  const matches = rows.flatMap((row) => row.parcelCodes.flatMap((sourceCode) => {
    const { agency, code } = shipmentParcelIdentity(row, sourceCode);
    if (code !== target) return [];
    return [{
      id: `${row.id}:${agency}:${sourceCode}`,
      agency,
      code,
      date: row.date,
      company: row.company,
      destination: row.destination,
      groupage: shipmentGroupage(row, sourceCode),
      status: row.status,
      arrivalDate: row.arrivalDate,
      isLatestForAgency: false
    } satisfies AdminShipmentParcelMatch];
  })).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  const latestAgencies = new Set<string>();
  return matches.map((match) => {
    const isLatestForAgency = !latestAgencies.has(match.agency);
    latestAgencies.add(match.agency);
    return { ...match, isLatestForAgency };
  });
}

export function shipmentParcelIdentity(row: ShipmentStatisticRow, sourceCode: string) {
  const normalized = normalizeCode(sourceCode);
  const klzTransit = row.company === "ETHIOPIAN" && row.destination === "LSHI" && normalized.endsWith("KLZ");
  return {
    agency: klzTransit ? "KLZ" : row.destination,
    code: klzTransit ? normalized.replace(/KLZ$/, "") : normalized
  };
}

function shipmentGroupage(row: ShipmentStatisticRow, sourceCode: string) {
  const lines = row.groupageCodes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const code = normalizeCode(sourceCode);
  const lineIndex = lines.findIndex((line) => normalizeCode(line).includes(code));
  if (lineIndex >= 0) {
    const inline = lines[lineIndex].match(/((?:GROU?PAGE|GRP)\s*[- ]?\d+)/i)?.[1];
    if (inline) return inline.trim();
    const previous = lines.slice(0, lineIndex).reverse().find((line) => /^(?:GROU?PAGE|GRP)\b/i.test(line));
    if (previous) return previous;
  }
  const labels = Array.from(`${row.groupageWeights}\n${row.arrivedGroupages}`.matchAll(/(?:GROU?PAGE|GRP)\s*[- ]?\d+/gi), (match) => match[0]);
  return row.groupages === 1 && labels.length ? labels[0] : "";
}

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
