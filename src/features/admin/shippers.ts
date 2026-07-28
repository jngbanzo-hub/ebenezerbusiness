import type {
  ManifestDestination,
  ManifestShipperRow,
  ManifestSite,
  ShipperAnomalyReport,
  ShipperBreakdown,
  ShipperStatistics,
  ShipperStatisticsApiResponse,
  ShipperSuggestion,
  ShipperSuggestionsApiResponse
} from "@/features/admin/types";

const STRICT_MANIFEST_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const STRICT_POSITIVE_WEIGHT = /^\d+(?:[.,]\d+)?$/;
const PHONE_PATTERN = /(\+?\d[\d\s()./-]{6,}\d)/;

const DESTINATION_BY_SITE: Record<ManifestSite, ManifestDestination> = {
  FIH: "Kinshasa",
  LSHI: "Lubumbashi",
  KLZ: "Kolwezi"
};

type ParsedDate = {
  dateKey: string;
};

type CandidateRow = {
  sourceSite: ManifestSite;
  rowNumber: number;
  dateKey: string;
  codeColis: string;
  expediteur: string;
  normalizedExpediteur: string;
  poidsKg: number | null;
};

export type ShipperStatisticsFilters = {
  shipper: string;
  startDate: string;
  endDate: string;
  site: ManifestSite | "ALL";
  destination: ManifestDestination | "ALL";
};

export class AdminShippersApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AdminShippersApiError";
  }
}

export async function loadShipperSuggestions(
  accessToken: string,
  query: string,
  signal?: AbortSignal
) {
  const response = await fetch(
    `/api/admin/shippers?q=${encodeURIComponent(query)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store",
      signal
    }
  );
  const payload = (await response.json()) as
    | ShipperSuggestionsApiResponse
    | { message?: string };

  if (!response.ok) {
    throw new AdminShippersApiError(
      "message" in payload && payload.message
        ? payload.message
        : "Recherche des expéditeurs impossible.",
      response.status
    );
  }

  return "shippers" in payload ? payload.shippers : [];
}

export async function loadShipperStatistics(
  accessToken: string,
  filters: ShipperStatisticsFilters,
  signal?: AbortSignal
) {
  const searchParams = new URLSearchParams({
    shipper: filters.shipper,
    from: filters.startDate,
    to: filters.endDate,
    site: filters.site,
    destination: filters.destination
  });
  const response = await fetch(
    `/api/admin/shippers/statistics?${searchParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store",
      signal
    }
  );
  const payload = (await response.json()) as
    | ShipperStatisticsApiResponse
    | { message?: string };

  if (!response.ok) {
    throw new AdminShippersApiError(
      "message" in payload && payload.message
        ? payload.message
        : "Chargement des statistiques impossible.",
      response.status
    );
  }

  if (!("statistics" in payload)) {
    throw new AdminShippersApiError(
      "Réponse de statistiques invalide.",
      response.status
    );
  }

  return payload.statistics;
}

export function normalizeShipperName(value: string) {
  return cleanShipperDisplayName(value)
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR");
}

export function cleanShipperDisplayName(value: string) {
  const withoutInvisibleCharacters = value
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  const phone = withoutInvisibleCharacters.match(PHONE_PATTERN)?.[0] ?? "";

  return withoutInvisibleCharacters
    .replace(phone, " ")
    .replace(/[()|/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeManifestCode(value: string) {
  return value
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

export function parseStrictManifestDate(value: string): ParsedDate | null {
  const match = value.trim().match(STRICT_MANIFEST_DATE);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (year < 1900 || year > 2100 || month < 1 || month > 12) {
    return null;
  }

  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ][month - 1];

  if (!daysInMonth || day < 1 || day > daysInMonth) {
    return null;
  }

  return {
    dateKey: `${String(year).padStart(4, "0")}-${String(month).padStart(
      2,
      "0"
    )}-${String(day).padStart(2, "0")}`
  };
}

export function parseStrictPositiveWeight(value: string) {
  const normalized = value
    .replace(/\u00a0/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!STRICT_POSITIVE_WEIGHT.test(normalized)) {
    return null;
  }

  const weight = Number(normalized.replace(",", "."));
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

export function buildShipperSuggestions(
  rows: ManifestShipperRow[],
  query: string,
  limit = 20
): ShipperSuggestion[] {
  const normalizedQuery = normalizeShipperName(query);
  const suggestions = new Map<string, ShipperSuggestion>();

  for (const row of rows) {
    const name = cleanShipperDisplayName(row.expediteurRaw);
    const normalizedName = normalizeShipperName(name);

    if (
      !name ||
      !normalizedName ||
      (normalizedQuery && !normalizedName.includes(normalizedQuery))
    ) {
      continue;
    }

    if (!suggestions.has(normalizedName)) {
      suggestions.set(normalizedName, { name, normalizedName });
    }
  }

  return Array.from(suggestions.values())
    .sort((left, right) => left.name.localeCompare(right.name, "fr"))
    .slice(0, limit);
}

export function calculateShipperStatistics(
  rows: ManifestShipperRow[],
  filters: ShipperStatisticsFilters
): ShipperStatistics {
  const normalizedTarget = normalizeShipperName(filters.shipper);
  const anomalies = createEmptyAnomalyReport();
  const candidates: CandidateRow[] = [];

  for (const row of rows) {
    const destination = DESTINATION_BY_SITE[row.sourceSite];
    if (
      (filters.site !== "ALL" && row.sourceSite !== filters.site) ||
      (filters.destination !== "ALL" && destination !== filters.destination)
    ) {
      continue;
    }

    const expediteur = cleanShipperDisplayName(row.expediteurRaw);
    const normalizedExpediteur = normalizeShipperName(expediteur);

    if (!normalizedExpediteur) {
      const missingShipperDate = parseStrictManifestDate(row.dateRaw);
      if (
        missingShipperDate &&
        missingShipperDate.dateKey >= filters.startDate &&
        missingShipperDate.dateKey <= filters.endDate
      ) {
        anomalies.missingShippers += 1;
      }
      continue;
    }

    if (normalizedExpediteur !== normalizedTarget) {
      continue;
    }

    const date = parseStrictManifestDate(row.dateRaw);
    if (!date) {
      anomalies.invalidDates += 1;
      continue;
    }

    if (date.dateKey < filters.startDate || date.dateKey > filters.endDate) {
      continue;
    }

    const codeColis = normalizeManifestCode(row.codeColisRaw);
    if (!codeColis) {
      anomalies.missingCodes += 1;
      continue;
    }

    const poidsKg = parseStrictPositiveWeight(row.poidsRaw);
    if (poidsKg === null) {
      anomalies.invalidWeights += 1;
    }

    candidates.push({
      sourceSite: row.sourceSite,
      rowNumber: row.rowNumber,
      dateKey: date.dateKey,
      codeColis,
      expediteur,
      normalizedExpediteur,
      poidsKg
    });
  }

  const grouped = new Map<string, CandidateRow[]>();
  for (const candidate of candidates) {
    const key = `${candidate.sourceSite}|${candidate.codeColis}`;
    const group = grouped.get(key) ?? [];
    group.push(candidate);
    grouped.set(key, group);
  }

  const bySite = createSiteBreakdown();
  const byDestination = createDestinationBreakdown();
  const parcels = Array.from(grouped.entries()).map(([id, group]) => {
    const ordered = [...group].sort(
      (left, right) =>
        left.dateKey.localeCompare(right.dateKey) ||
        left.rowNumber - right.rowNumber
    );
    const representative = ordered[0];
    const uniqueWeights = new Set(
      group
        .map((row) => row.poidsKg)
        .filter((weight): weight is number => weight !== null)
        .map((weight) => weight.toString())
    );

    if (group.length > 1) {
      anomalies.duplicateRows += group.length - 1;
    }

    let poidsKg: number | null = null;
    if (uniqueWeights.size === 1) {
      poidsKg = Number(Array.from(uniqueWeights)[0]);
    } else if (uniqueWeights.size > 1) {
      anomalies.conflictingWeights += 1;
    }

    const destination = DESTINATION_BY_SITE[representative.sourceSite];
    addBreakdown(bySite[representative.sourceSite], poidsKg);
    addBreakdown(byDestination[destination], poidsKg);

    return {
      id,
      date: representative.dateKey,
      codeColis: representative.codeColis,
      expediteur: representative.expediteur,
      sourceSite: representative.sourceSite,
      destination,
      poidsKg
    };
  });

  const sitesByCode = new Map<string, Set<ManifestSite>>();
  for (const parcel of parcels) {
    const sites = sitesByCode.get(parcel.codeColis) ?? new Set<ManifestSite>();
    sites.add(parcel.sourceSite);
    sitesByCode.set(parcel.codeColis, sites);
  }
  anomalies.crossSiteCodes = Array.from(sitesByCode.values()).filter(
    (sites) => sites.size > 1
  ).length;

  parcels.sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      left.sourceSite.localeCompare(right.sourceSite) ||
      left.codeColis.localeCompare(right.codeColis)
  );

  const weightedParcels = parcels.filter(
    (parcel): parcel is typeof parcel & { poidsKg: number } =>
      parcel.poidsKg !== null
  );
  const totalKilogrammes = roundWeight(
    weightedParcels.reduce((total, parcel) => total + parcel.poidsKg, 0)
  );

  return {
    expediteur: parcels[0]?.expediteur ?? cleanShipperDisplayName(filters.shipper),
    normalizedExpediteur: normalizedTarget,
    startDate: filters.startDate,
    endDate: filters.endDate,
    nombreColis: parcels.length,
    totalKilogrammes,
    poidsMoyenKg:
      weightedParcels.length > 0
        ? roundWeight(totalKilogrammes / weightedParcels.length)
        : null,
    bySite,
    byDestination,
    parcels,
    anomalies
  };
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function createEmptyAnomalyReport(): ShipperAnomalyReport {
  return {
    invalidDates: 0,
    missingCodes: 0,
    missingShippers: 0,
    invalidWeights: 0,
    duplicateRows: 0,
    conflictingWeights: 0,
    crossSiteCodes: 0
  };
}

function createBreakdown(): ShipperBreakdown {
  return { colis: 0, kilogrammes: 0 };
}

function createSiteBreakdown(): Record<ManifestSite, ShipperBreakdown> {
  return {
    FIH: createBreakdown(),
    LSHI: createBreakdown(),
    KLZ: createBreakdown()
  };
}

function createDestinationBreakdown(): Record<
  ManifestDestination,
  ShipperBreakdown
> {
  return {
    Kinshasa: createBreakdown(),
    Lubumbashi: createBreakdown(),
    Kolwezi: createBreakdown()
  };
}

function addBreakdown(breakdown: ShipperBreakdown, weight: number | null) {
  breakdown.colis += 1;
  if (weight !== null) {
    breakdown.kilogrammes = roundWeight(breakdown.kilogrammes + weight);
  }
}

function roundWeight(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
