import type { ShipmentStatisticRow } from "@/features/admin/shipment-statistics";

export type AdminShipmentParcelMatch = {
  id: string;
  agency: string;
  rawCode: string;
  canonicalCode: string;
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
  const target = shipmentSearchIdentity(searchedCode);
  const candidates = rows.flatMap((row) => row.parcelCodes.flatMap((sourceCode) => {
    const identity = shipmentParcelIdentity(row, sourceCode);
    if (identity.canonicalCode !== target.canonicalCode || (target.agency && identity.agency !== target.agency)) return [];
    return [{
      id: `${row.id}:${identity.agency}:${identity.rawCode}`,
      agency: identity.agency,
      rawCode: identity.rawCode,
      canonicalCode: identity.canonicalCode,
      code: identity.canonicalCode,
      date: row.date,
      company: row.company,
      destination: row.destination,
      groupage: shipmentGroupage(row, sourceCode),
      status: row.status,
      arrivalDate: row.arrivalDate,
      isLatestForAgency: false
    } satisfies AdminShipmentParcelMatch];
  }));
  const matches = Array.from(new Map(candidates.map((match) => [match.id, match])).values())
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  const latestAgencies = new Set<string>();
  return matches.map((match) => {
    const isLatestForAgency = !latestAgencies.has(match.agency);
    latestAgencies.add(match.agency);
    return { ...match, isLatestForAgency };
  });
}

export function shipmentParcelIdentity(row: ShipmentStatisticRow, sourceCode: string) {
  const rawCode = normalizeCode(sourceCode);
  const projected = projectedShipmentIdentity(rawCode);
  return {
    rawCode,
    canonicalCode: projected?.canonicalCode ?? rawCode,
    agency: projected?.agency ?? row.destination,
    code: projected?.canonicalCode ?? rawCode
  };
}

function shipmentSearchIdentity(value: unknown) {
  const rawCode = normalizeCode(value);
  const projected = projectedShipmentIdentity(rawCode);
  return { canonicalCode: projected?.canonicalCode ?? rawCode, agency: projected?.agency ?? null };
}

function projectedShipmentIdentity(rawCode: string) {
  const match = rawCode.match(/^(.*)(FIH|LSHI|KLZ)$/);
  if (!match) return null;
  const canonicalCode = match[1];
  if (!/^[A-Z]{1,10}\d{2,}[BCD]?$/.test(canonicalCode)) return null;
  return { canonicalCode, agency: match[2] };
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
