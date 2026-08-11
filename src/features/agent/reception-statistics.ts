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

export type ReceptionParcel = {
  code: string;
  copyCode: string;
  weightKg: number;
};

export type ReceptionStatistics = {
  agency: ReceptionAgency;
  totals: { parcels: number; weightKg: number };
  rows: ReceptionStatisticsRow[];
  parcels: ReceptionParcel[];
  copyValidationErrors: string[];
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
  const selectedParcels = new Map<string, ReceptionParcel>();
  const copyValidationErrors = new Set<string>();
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
      const weights = parcelWeights(shipment);
      for (const code of projection.codes) {
        if (selectedParcels.has(code)) continue;
        const weightKg = weights.get(code);
        const copyCode = agency === "KLZ" && specialEthiopianShipment(shipment)
          ? stripKlzSuffix(code)
          : code;
        if (!copyCode) copyValidationErrors.add(`Code colis invalide : ${code || "vide"}.`);
        if (!weightKg || weightKg <= 0) copyValidationErrors.add(`Poids introuvable ou invalide pour ${code}.`);
        if (Array.from(selectedParcels.values()).some((parcel) => parcel.copyCode === copyCode)) {
          copyValidationErrors.add(`Code dupliqué après normalisation : ${copyCode}.`);
        }
        selectedParcels.set(code, { code, copyCode, weightKg: weightKg ?? 0 });
      }
    } else {
      fallbackParcels += uniqueParcels;
      copyValidationErrors.add(`Le groupage ${shipment.groupageCodes || shipment.id} ne contient pas de codes détaillés copiables.`);
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
    parcels: Array.from(selectedParcels.values()),
    copyValidationErrors: Array.from(copyValidationErrors),
  };
}

function projectShipment(row: ShipmentStatisticRow, agency: ReceptionAgency) {
  const specialEthiopian = specialEthiopianShipment(row);
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

function specialEthiopianShipment(row: ShipmentStatisticRow) {
  return row.company === "ETHIOPIAN" && row.destination === "LSHI";
}

export function isKlzSuffix(code: string) {
  return code.trim().toUpperCase().endsWith("KLZ");
}

export function stripKlzSuffix(code: string) {
  return code.trim().replace(/\s*KLZ$/i, "").trim();
}

export function formatParcelsForArrival(parcels: ReceptionParcel[]) {
  const seen = new Set<string>();
  return parcels.map((parcel) => {
    const code = parcel.copyCode.trim().toUpperCase();
    if (!code) throw new Error("Un code colis est vide.");
    if (!Number.isFinite(parcel.weightKg) || parcel.weightKg <= 0) throw new Error(`Le poids de ${code} est invalide.`);
    if (seen.has(code)) throw new Error(`Le code ${code} apparaît plusieurs fois.`);
    seen.add(code);
    return `${code} : ${formatCopyWeight(parcel.weightKg)}Kgs`;
  }).join("\n");
}

function parcelWeights(row: ShipmentStatisticRow) {
  const weights = new Map<string, number>();
  const inline = `${row.groupageCodes}\n${row.groupageWeights}`;
  const pairs = Array.from(inline.matchAll(/([A-Z]{1,10}[ \t]*-?[ \t]*\d{2,}(?:[ \t]*[A-Z]{1,5})?)\s*:\s*(-?\d+(?:[.,]\d+)?)\s*(?:KGS?|KILOGRAMMES?)/gi));
  for (const match of pairs) {
    const code = match[1].replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const weight = Number(match[2].replace(",", "."));
    if (weight > 0 && !weights.has(code)) weights.set(code, weight);
  }
  if (weights.size < row.parcelCodes.length) {
    const aligned = parseWeights(row.groupageWeights);
    if (aligned.length === row.parcelCodes.length) {
      row.parcelCodes.forEach((code, index) => { if (!weights.has(code)) weights.set(code, aligned[index]); });
    }
  }
  return weights;
}

function formatCopyWeight(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
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
