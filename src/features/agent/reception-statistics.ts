import {
  filterShipmentStatistics,
  type ShipmentStatisticRow,
} from "@/features/admin/shipment-statistics";

export type ReceptionAgency = "FIH" | "LSHI" | "KLZ";

export type ReceptionStatisticsRow = {
  id: string;
  date: string;
  company: string;
  groupage: string;
  parcels: number;
  weightKg: number;
  status: string;
};

export type ReceptionStatistics = {
  agency: ReceptionAgency;
  totals: { parcels: number; weightKg: number };
  rows: ReceptionStatisticsRow[];
};

export type ReceptionFilters = {
  from?: string;
  to?: string;
  company?: string;
  status?: string;
  arrival?: string;
  search?: string;
};

export function projectReceptionStatistics(
  shipments: ShipmentStatisticRow[],
  agency: ReceptionAgency,
  filters: ReceptionFilters = {},
): ReceptionStatistics {
  const filtered = filterShipmentStatistics(shipments, filters).shipments;
  const seenCodes = new Set<string>();
  let fallbackParcels = 0;
  const rows = filtered.flatMap((shipment) => {
    const projection = projectShipment(shipment, agency);
    if (!projection || projection.parcels === 0) return [];
    let uniqueParcels = projection.parcels;
    if (projection.codes.length) {
      uniqueParcels = projection.codes.reduce((count, code) => {
        if (seenCodes.has(code)) return count;
        seenCodes.add(code);
        return count + 1;
      }, 0);
      if (uniqueParcels === 0) return [];
    } else {
      fallbackParcels += uniqueParcels;
    }
    return [{
      id: `${shipment.id}-${agency}`,
      date: shipment.date,
      company: shipment.company,
      groupage: shipment.groupageCodes || shipment.arrivedGroupages || "—",
      parcels: uniqueParcels,
      weightKg: projection.weightKg,
      status: shipment.status || "—",
    }];
  });
  return {
    agency,
    totals: {
      parcels: seenCodes.size + fallbackParcels,
      weightKg: round(rows.reduce((sum, row) => sum + row.weightKg, 0)),
    },
    rows: rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
  };
}

function projectShipment(row: ShipmentStatisticRow, agency: ReceptionAgency) {
  const specialEthiopian = row.company === "ETHIOPIAN" && row.destination === "LSHI";
  const directDestination = row.destination === agency;
  if (!directDestination && !(specialEthiopian && agency === "KLZ")) return null;

  const codes = row.parcelCodes;
  if (!specialEthiopian) {
    return {
      codes,
      parcels: codes.length || row.parcelCount || 0,
      weightKg: canonicalManifestWeight(row),
    };
  }

  if (!codes.length) {
    return agency === "LSHI"
      ? { codes, parcels: row.parcelCount || 0, weightKg: canonicalManifestWeight(row) }
      : null;
  }

  const selectedCodes = codes.filter((code) => isKlzSuffix(code) === (agency === "KLZ"));
  const weights = parseWeights(row.groupageWeights);
  const totalWeight = canonicalManifestWeight(row);
  const weightKg = weights.length === codes.length
    ? selectedCodes.reduce((sum, code) => sum + weights[codes.indexOf(code)], 0)
    : totalWeight * (selectedCodes.length / codes.length);
  return { codes: selectedCodes, parcels: selectedCodes.length, weightKg: round(weightKg) };
}

export function isKlzSuffix(code: string) {
  return code.trim().toUpperCase().endsWith("KLZ");
}

function canonicalManifestWeight(row: ShipmentStatisticRow) {
  return row.manifestWeightKg > 0 ? row.manifestWeightKg : row.weightKg;
}

function parseWeights(value: string) {
  return Array.from(value.matchAll(/(-?\d+(?:[.,]\d+)?)\s*(?:KGS?|KILOGRAMMES?)/gi), (match) => Number(match[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
