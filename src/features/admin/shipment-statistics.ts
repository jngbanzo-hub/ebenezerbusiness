export const SHIPMENT_STATISTICS_SHEET = "STATISTIQUES DES EXPÉDITIONS";
const AGENCY_SCOPED_IDENTITY_START_DATE = "2026-08-01";
const TRANSIT_GROUPAGE_STATUSES = new Set(["EN TRANSIT A ADDIS", "EN TRANSIT A LIBREVILLE"]);

export type ShipmentStatisticRow = {
  id: string; date: string; company: string; destination: string; groupages: number;
  weightKg: number; groupageCodes: string; pricePerKg: number; amountUsd: number;
  groupageWeights: string; manifestTotal: string; status: string; arrivalDate: string;
  arrivedGroupages: string; klzPackages: string; parcelCount: number | null;
  manifestWeightKg: number; parcelCodes: string[];
  parcelDetails?: Array<{ code: string; weightKg: number }>;
};

export type ShipmentStatistics = {
  shipments: ShipmentStatisticRow[];
  totals: {
    shipments: number; groupages: number; weightKg: number; manifestWeightKg: number;
    amountUsd: number; parcels: number;
    destinationParcels: { fih: number; lshi: number; klz: number };
    destinationManifestWeightKg: { lshi: number; klz: number };
  };
  byCompany: Array<{ label: string; shipments: number; weightKg: number }>;
  byDestination: Array<{ label: string; shipments: number; weightKg: number }>;
};

export type ShipmentCohortStatistics = {
  cohortId: string;
  shipments: Array<{
    id: string; date: string; company: string; destination: string;
    parcelCodes: string[]; parcels: number | null; commercialWeightKg: number | null;
  }>;
  totals: { shipmentsContainingCohort: number; parcels: number; commercialWeightKg: number };
  excludedRows: number;
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
      parcelCount: parseParcelCount(row[9], row[13]),
      manifestWeightKg: parseManifestWeight(row[8]),
      parcelCodes: parseParcelCodes(row[5]),
      parcelDetails: parseParcelDetails(row[5])
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
    (!filters.status || filters.status === "ALL" || (filters.status === "EN TRANSIT"
      ? TRANSIT_GROUPAGE_STATUSES.has(normalizeGroupageStatus(row.status))
      : filters.status === "EN VOL"
        ? normalizeGroupageStatus(row.status) === "EN VOL"
        : normalize(row.status) === filters.status)) &&
    (!filters.arrival || filters.arrival === "ALL" || (filters.arrival === "ARRIVED" ? Boolean(row.arrivedGroupages || row.arrivalDate) : !row.arrivedGroupages && !row.arrivalDate)) &&
    (!search || normalize(`${row.groupageCodes} ${row.arrivedGroupages}`).includes(search))
  ));
}

/** Called only for a selected registry cohort, after the existing shipment filters. */
export function selectShipmentCohort(rows: ShipmentStatisticRow[], cohortId: string, resolveCohortId: (code: string) => string | null): ShipmentCohortStatistics {
  const identities = new Set<string>();
  const shipments: ShipmentCohortStatistics["shipments"] = [];
  let commercialWeightKg = 0;
  let excludedRows = 0;

  for (const row of rows) {
    const resolved = row.parcelCodes.map((code) => {
      // KLZ is a physical destination annotation in this sheet, not part of
      // the business tracking code. Keep any preceding B/C/D suffix intact.
      const businessCode = code.endsWith("KLZ") ? code.slice(0, -3) : code;
      return { code, cohortId: resolveCohortId(businessCode) };
    });
    const selected = resolved.filter((item) => item.cohortId === cohortId);
    const unresolved = resolved.some((item) => item.cohortId === null);
    const declaredCountConflicts = row.parcelCount !== null && row.parcelCount !== row.parcelCodes.length;
    const countCertifiable = Boolean(resolved.length) && !unresolved && !declaredCountConflicts;
    const sourceWeightIsPresent = row.manifestWeightKg > 0 &&
      /\b\d+(?:[.,]\d+)?\s*(?:KGS?|KILOGRAMMES?)\b/i.test(row.groupageWeights);
    const cohortIds = new Set(resolved.map((item) => item.cohortId));
    let selectedWeight: number | null = null;

    if (selected.length && !unresolved && sourceWeightIsPresent) {
      if (cohortIds.size === 1) {
        // The whole commercial weight in column I belongs to this cohort.
        selectedWeight = row.manifestWeightKg;
      } else {
        const weights = new Map<string, number>();
        for (const detail of row.parcelDetails ?? []) weights.set(detail.code, (weights.get(detail.code) ?? 0) + detail.weightKg);
        const detailTotal = Array.from(weights.values()).reduce((sum, weight) => sum + weight, 0);
        if (row.parcelCodes.every((code) => weights.has(code)) && weights.size === row.parcelCodes.length &&
            Math.abs(detailTotal - row.manifestWeightKg) < 0.001) {
          selectedWeight = selected.reduce((sum, item) => sum + (weights.get(item.code) ?? 0), 0);
        }
      }
    }

    if (!resolved.length || unresolved || declaredCountConflicts || !sourceWeightIsPresent ||
        (selected.length && selectedWeight === null)) excludedRows += 1;
    if (!selected.length) continue;
    if (countCertifiable) for (const item of selected) identities.add(statisticalParcelIdentity(row, item.code));
    if (selectedWeight !== null) commercialWeightKg += selectedWeight;
    shipments.push({ id: row.id, date: row.date, company: row.company, destination: row.destination,
      parcelCodes: selected.map((item) => item.code), parcels: countCertifiable ? selected.length : null,
      commercialWeightKg: selectedWeight });
  }

  return { cohortId, shipments, totals: { shipmentsContainingCohort: shipments.length,
    parcels: identities.size, commercialWeightKg }, excludedRows };
}

function summarizeShipments(shipments: ShipmentStatisticRow[]): ShipmentStatistics {
  const aggregate = (key: "company" | "destination") => Array.from(shipments.reduce((map, row) => {
    const label = row[key] || "NON RENSEIGNÉ";
    const current = map.get(label) ?? { label, shipments: 0, weightKg: 0 };
    current.shipments += 1; current.weightKg += row.weightKg; map.set(label, current); return map;
  }, new Map<string, { label: string; shipments: number; weightKg: number }>()).values()).sort((a, b) => a.label.localeCompare(b.label));
  const detailedCodes = new Set<string>();
  const destinationCodes = { fih: new Set<string>(), lshi: new Set<string>(), klz: new Set<string>() };
  let fallbackParcels = 0;
  const fallbackDestinationParcels = { fih: 0, lshi: 0, klz: 0 };
  const destinationManifestWeightKg = { lshi: 0, klz: 0 };
  for (const row of shipments) {
    if (row.parcelCodes.length) {
      for (const code of row.parcelCodes) {
        detailedCodes.add(statisticalParcelIdentity(row, code));
        if (usesLshiKlzBreakdown(row) && row.company !== "ETHIOPIAN") {
          destinationCodes[classifyLshiKlzParcel(code)].add(code);
        } else if (["ASKY", "DHL"].includes(row.company) && row.destination === "FIH") {
          destinationCodes.fih.add(code);
        }
      }
    } else {
      const count = row.parcelCount ?? 0;
      fallbackParcels += count;
      if (usesLshiKlzBreakdown(row)) fallbackDestinationParcels.lshi += count;
      if (["ASKY", "DHL"].includes(row.company) && row.destination === "FIH") fallbackDestinationParcels.fih += count;
    }
    if (usesLshiKlzBreakdown(row)) {
      for (const parcel of row.parcelDetails ?? []) {
        if (row.company === "ETHIOPIAN") destinationCodes[classifyLshiKlzParcel(parcel.code)].add(parcel.code);
        destinationManifestWeightKg[classifyLshiKlzParcel(parcel.code)] += parcel.weightKg;
      }
    }
  }
  return {
    shipments,
    totals: shipments.reduce((total, row) => ({ ...total, shipments: total.shipments + 1, groupages: total.groupages + row.groupages, weightKg: total.weightKg + row.weightKg, manifestWeightKg: total.manifestWeightKg + row.manifestWeightKg, amountUsd: total.amountUsd + row.amountUsd }), {
      shipments: 0, groupages: 0, weightKg: 0, manifestWeightKg: 0, amountUsd: 0,
      parcels: detailedCodes.size + fallbackParcels,
      destinationParcels: {
        fih: destinationCodes.fih.size + fallbackDestinationParcels.fih,
        lshi: destinationCodes.lshi.size + fallbackDestinationParcels.lshi,
        klz: destinationCodes.klz.size + fallbackDestinationParcels.klz
      },
      destinationManifestWeightKg
    }),
    byCompany: aggregate("company"), byDestination: aggregate("destination")
  };
}

export function usesLshiKlzBreakdown(row: ShipmentStatisticRow) {
  return row.destination === "LSHI" && ["ETHIOPIAN", "DHL"].includes(row.company);
}

function classifyLshiKlzParcel(code: string) {
  return code.endsWith("KLZ") ? "klz" as const : "lshi" as const;
}

function statisticalParcelIdentity(row: ShipmentStatisticRow, code: string) {
  if (row.date < AGENCY_SCOPED_IDENTITY_START_DATE) return code;
  const destination = row.company === "ETHIOPIAN" && row.destination === "LSHI" && code.endsWith("KLZ")
    ? "KLZ"
    : row.destination;
  const businessCode = destination === "KLZ" ? code.replace(/KLZ$/, "") : code;
  return `${destination}|${businessCode}`;
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : String(value ?? "").trim(); }
function number(value: unknown) { const parsed = Number(text(value).replace(/[^\d,.-]/g, "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function normalizeDate(value: unknown) {
  const raw = text(value); const match = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (match) { const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : String(new Date().getFullYear()); return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}
function parseParcelCount(...values: unknown[]) { for (const value of values) { const match = text(value).match(/(\d+)\s*(?:COLIS|PCS)/i); if (match) return Number(match[1]); } return null; }
function parseManifestWeight(value: unknown) {
  const raw = text(value);
  const kilograms = Array.from(raw.matchAll(/(-?\d+(?:[.,]\d+)?)\s*(?:KGS?|KILOGRAMMES?)/gi), (match) => Number(match[1].replace(",", ".")));
  const values = kilograms.length ? kilograms : Array.from(raw.matchAll(/-?\d+(?:[.,]\d+)?/g), (match) => Number(match[0].replace(",", ".")));
  return values.reduce((sum, item) => sum + (Number.isFinite(item) && item > 0 ? item : 0), 0);
}
function parseParcelCodes(value: unknown) {
  const matches = text(value).toUpperCase().match(/[A-Z]{1,10}[ \t]*-?[ \t]*\d{2,}(?:[ \t]*[A-Z]{1,5})?/g) ?? [];
  return Array.from(new Set(matches.map((code) => code.replace(/[^A-Z0-9]/g, "")).filter((code) =>
    /^[A-Z]{1,10}\d{2,}[A-Z]*$/.test(code) && !/^(?:GROU?PAGE|GRP|SAC)\d/.test(code)
  )));
}
function parseParcelDetails(value: unknown) {
  const raw = text(value).toUpperCase();
  const pattern = /\b([A-Z]{1,10}[ \t]*-?[ \t]*\d{2,}(?:[ \t]*[A-Z]{1,5})?)\s*:\s*(-?\d+(?:[.,]\d+)?)\s*(?:KGS?|KILOGRAMMES?)\b/g;
  return Array.from(raw.matchAll(pattern)).flatMap((match) => {
    const code = match[1].replace(/[^A-Z0-9]/g, "");
    const weightKg = Number(match[2].replace(",", "."));
    // Groupage titles can carry a suffix (for example GROUPAGE081KLZ).
    // They are not parcel-code/weight pairs and must not inflate the weight.
    return code && !/^(?:GROUPAGE|GRP)\d+[A-Z]*$/.test(code) && Number.isFinite(weightKg) && weightKg > 0
      ? [{ code, weightKg }]
      : [];
  });
}
function normalize(value: unknown) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function normalizeGroupageStatus(value: unknown) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " "); }
