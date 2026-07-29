import "server-only";

import { createSign } from "crypto";
import { readFileSync } from "fs";

import { z } from "zod";

import {
  STOCKAGES_SHEET_NAMES,
  type AdminAgencyStock,
  type AdminInitialBalance,
  type AdminStockMovement,
  type AdminStockagesAnomaly,
  type AdminStockagesAuditEntry,
  type AdminStockagesAuditResponse,
  type AdminStockagesMovementsResponse,
  type AdminStockagesStatusResponse,
  type StockagesAnomalyCategory,
  type StockagesSheetAvailability,
  type StockagesSheetName
} from "@/features/stockages/admin-stockages-types";
import {
  STOCKAGES_SITES,
  type StockagesInitialBalanceStatus,
  type StockagesPreparationStatus,
  type StockagesSite
} from "@/features/stockages/types";
import {
  assertStockagesPreparationMode,
  getStockagesServerFeatureFlags
} from "@/server/stockages-feature-flags";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const READ_ONLY_RANGES: Record<StockagesSheetName, string> = {
  PARAMETRES: "PARAMETRES!A:E",
  "SOLDE INITIAL": "SOLDE INITIAL!A:I",
  "HISTORIQUE STATUTS": "HISTORIQUE STATUTS!A:Z",
  "MOUVEMENTS STOCK": "MOUVEMENTS STOCK!A:Z",
  "STOCK JOURNALIER": "STOCK JOURNALIER!A:Z",
  AUDIT: "AUDIT!A:J",
  "ANOMALIES MANIFESTE": "ANOMALIES MANIFESTE!A:Z",
  "PHOTOGRAPHIE STATUTS": "PHOTOGRAPHIE STATUTS!A:Z",
  "SIMULATION SYNCHRONISATION": "SIMULATION SYNCHRONISATION!A:Z",
  "EXCLUSIONS PHOTOGRAPHIE": "EXCLUSIONS PHOTOGRAPHIE!A:Z"
};

const UNAVAILABLE_MESSAGE = "Non disponible avant l’activation" as const;

const stockagesSheetsEnvSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_SHEETS_CLIENT_EMAIL: z.string().email().optional(),
  GOOGLE_SHEETS_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_SHEETS_STOCKAGES_SPREADSHEET_ID: z.string().min(1)
});

type StockagesGoogleSheetsConfig = {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
};

type ServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleValueRange = {
  range?: string;
  values?: unknown[][];
};

type GoogleSheetsBatchResponse = {
  valueRanges?: GoogleValueRange[];
  error?: {
    message?: string;
  };
};

type GoogleSheetsMetadataResponse = {
  sheets?: Array<{
    properties?: {
      title?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function readStockagesPreparationStatus(
  allowedSites: readonly StockagesSite[]
): Promise<StockagesPreparationStatus> {
  assertStockagesPreparationMode();

  if (!process.env.GOOGLE_SHEETS_STOCKAGES_SPREADSHEET_ID?.trim()) {
    return createUnavailablePreparationStatus(allowedSites);
  }

  const config = getStockagesGoogleSheetsConfig();
  const accessToken = await getGoogleAccessToken(config);
  const sheetTitles = await readStockagesSheetTitles(config, accessToken);
  const valueRanges = await readStockagesRanges(config, accessToken, sheetTitles);
  const parameters = parseParameters(getRows(valueRanges, "PARAMETRES"));
  const auditRows = getRows(valueRanges, "AUDIT");
  const balances = parseInitialBalances(
    getRows(valueRanges, "SOLDE INITIAL"),
    allowedSites
  );
  const lastSimulation = findLastAuditEvent(
    auditRows,
    "SIMULATION_SYNCHRONISATION_STATUTS"
  );
  const lastManifestAudit =
    findLastAuditEvent(auditRows, "AUDIT_ANOMALIES_MANIFESTE_PUBLIC") ??
    findLastAuditEvent(auditRows, "AUDIT_MANIFESTE_PUBLIC");

  return {
    mode: "PREPARATION",
    systemStatus: parameters.get("SYSTEM_STATUS") ?? null,
    activationDate: parameters.get("DATE_ACTIVATION") ?? null,
    realSyncEnabled: false,
    initialBalances: balances,
    snapshot: {
      present: sheetTitles.has("PHOTOGRAPHIE STATUTS"),
      status: parameters.get("INITIAL_SNAPSHOT_STATUS") ?? null
    },
    lastSimulation: lastSimulation
      ? {
          date: lastSimulation.date,
          result: lastSimulation.result
        }
      : null,
    anomalies: {
      blocking: lastManifestAudit
        ? extractBlockingAnomalyCount(lastManifestAudit.details)
        : null,
      result: lastManifestAudit?.result ?? null
    },
    lastUpdatedAt: findLastUpdateDate(auditRows)
  };
}

export async function readAdminStockagesStatus(): Promise<AdminStockagesStatusResponse> {
  const source = await readAdminStockagesSource();
  const parameters = parseParameters(source.rows("PARAMETRES"));
  const systemStatus = parameters.get("SYSTEM_STATUS") ?? "BROUILLON";
  const activated = normalizeText(systemStatus) !== "BROUILLON";
  const auditRows = source.rows("AUDIT");
  const anomalies = parseAdminAnomalies(source);
  const lastSimulation =
    lastNonEmptyDate(source.rows("SIMULATION SYNCHRONISATION")) ??
    findLastAuditEvent(auditRows, "SIMULATION_SYNCHRONISATION_STATUTS")?.date ??
    null;
  const lastSynchronization =
    findLastAuditEvent(auditRows, "SYNCHRONISATION_STATUTS")?.date ?? null;

  return {
    mode: "PREPARATION",
    unavailableMessage: UNAVAILABLE_MESSAGE,
    overview: {
      systemStatus,
      activationDate:
        parameters.get("DATE_ACTIVATION") ?? "03/08/2026 07:00 Africa/Porto-Novo",
      initialSnapshot: source.available("PHOTOGRAPHIE STATUTS")
        ? parameters.get("INITIAL_SNAPSHOT_STATUS") ?? "Disponible"
        : null,
      lastSimulation,
      lastSynchronization,
      lastUpdatedAt: findLastUpdateDate(auditRows),
      blockingAnomalies: countAnomalies(anomalies, "ANOMALIE_BLOQUANTE"),
      negativeStockAlerts: countAnomalies(anomalies, "STOCK_NEGATIF")
    },
    initialBalances: parseAdminInitialBalances(
      source.rows("SOLDE INITIAL"),
      activated
    ),
    agencyStocks: parseAdminAgencyStocks(
      source.rows("STOCK JOURNALIER"),
      activated && source.available("STOCK JOURNALIER")
    ),
    anomalies,
    sheetAvailability: source.availability,
    actionsEnabled: false,
    adjustmentsEnabled: false,
    exportsEnabled: false
  };
}

export async function readAdminStockagesMovements(filters: {
  site: string;
  date: string;
  parcelCode: string;
  movementType: string;
  triggerStatus: string;
  state: string;
}): Promise<AdminStockagesMovementsResponse> {
  const source = await readAdminStockagesSource();
  if (!source.available("MOUVEMENTS STOCK")) {
    return {
      available: false,
      unavailableMessage: UNAVAILABLE_MESSAGE,
      movements: []
    };
  }

  const movements = parseTable(source.rows("MOUVEMENTS STOCK"), (row, index) => {
    const site = normalizeSite(readNamedCell(row, ["AGENCE", "SITE"]));
    const cancelled = normalizeText(
      readNamedCell(row, ["ANNULE", "ANNULÉ", "STATUT"])
    );
    return {
      id: `movement-${index + 2}`,
      date: readNamedCell(row, ["DATE", "HORODATAGE"]),
      site,
      parcelCode: readNamedCell(row, ["CODE COLIS", "CODE_COLIS"]),
      movementType: readNamedCell(row, ["TYPE MOUVEMENT", "TYPE_MOUVEMENT", "TYPE"]),
      triggerStatus: readNamedCell(row, [
        "STATUT DECLENCHEUR",
        "STATUT DÉCLENCHEUR",
        "STATUT_DECLENCHEUR"
      ]),
      state:
        cancelled === "OUI" || cancelled === "ANNULE" || cancelled === "CANCELLED"
          ? ("CANCELLED" as const)
          : ("ACTIVE" as const),
      parcels: parseOptionalNumber(readNamedCell(row, ["COLIS", "NOMBRE COLIS"])),
      kilograms: parseOptionalNumber(readNamedCell(row, ["KG", "KILOGRAMMES"])),
      details: readNamedCell(row, ["DETAILS", "DÉTAILS", "OBSERVATION"])
    };
  }).filter((movement) => {
    return (
      matchesFilter(movement.site ?? "", filters.site) &&
      matchesFilter(movement.date, filters.date, true) &&
      matchesFilter(movement.parcelCode, filters.parcelCode, true) &&
      matchesFilter(movement.movementType, filters.movementType) &&
      matchesFilter(movement.triggerStatus, filters.triggerStatus) &&
      matchesFilter(movement.state, filters.state)
    );
  });

  return {
    available: true,
    unavailableMessage: UNAVAILABLE_MESSAGE,
    movements
  };
}

export async function readAdminStockagesAudit(filters: {
  site: string;
  date: string;
  user: string;
  action: string;
  reference: string;
  result: string;
}): Promise<AdminStockagesAuditResponse> {
  const source = await readAdminStockagesSource();
  if (!source.available("AUDIT")) {
    return {
      available: false,
      unavailableMessage: UNAVAILABLE_MESSAGE,
      entries: []
    };
  }

  const entries = parseAuditEntries(source.rows("AUDIT")).filter((entry) => {
    return (
      matchesFilter(entry.site ?? "", filters.site) &&
      matchesFilter(entry.date, filters.date, true) &&
      matchesFilter(entry.user, filters.user, true) &&
      matchesFilter(entry.action, filters.action) &&
      matchesFilter(entry.reference, filters.reference, true) &&
      matchesFilter(entry.result, filters.result)
    );
  });

  return {
    available: true,
    unavailableMessage: UNAVAILABLE_MESSAGE,
    entries
  };
}

async function readAdminStockagesSource() {
  assertStockagesPreparationMode();
  const disabledFlags = getStockagesServerFeatureFlags();
  if (
    disabledFlags.realSyncEnabled ||
    disabledFlags.adminActionsEnabled ||
    disabledFlags.adjustmentsEnabled ||
    disabledFlags.exportsEnabled
  ) {
    throw new Error("Les actions Stockages doivent rester désactivées.");
  }

  const configured = Boolean(
    process.env.GOOGLE_SHEETS_STOCKAGES_SPREADSHEET_ID?.trim()
  );
  if (!configured) {
    const availability = createSheetAvailability(new Set());
    return createAdminSource([], availability);
  }

  const config = getStockagesGoogleSheetsConfig();
  const accessToken = await getGoogleAccessToken(config);
  const titles = await readStockagesSheetTitles(config, accessToken);
  const availability = createSheetAvailability(titles);
  const ranges = await readStockagesRanges(config, accessToken, titles);
  return createAdminSource(ranges, availability);
}

function createUnavailablePreparationStatus(
  allowedSites: readonly StockagesSite[]
): StockagesPreparationStatus {
  return {
    mode: "PREPARATION",
    systemStatus: null,
    activationDate: null,
    realSyncEnabled: false,
    initialBalances: allowedSites.map((site) => ({
      site,
      status: null
    })),
    snapshot: {
      present: false,
      status: null
    },
    lastSimulation: null,
    anomalies: {
      blocking: null,
      result: null
    },
    lastUpdatedAt: null
  };
}

function getStockagesGoogleSheetsConfig(): StockagesGoogleSheetsConfig {
  const parsed = stockagesSheetsEnvSchema.safeParse({
    GOOGLE_SERVICE_ACCOUNT_JSON: emptyToUndefined(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ),
    GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: emptyToUndefined(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
    ),
    GOOGLE_APPLICATION_CREDENTIALS: emptyToUndefined(
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    ),
    GOOGLE_SHEETS_CLIENT_EMAIL: emptyToUndefined(
      process.env.GOOGLE_SHEETS_CLIENT_EMAIL
    ),
    GOOGLE_SHEETS_PRIVATE_KEY: emptyToUndefined(
      process.env.GOOGLE_SHEETS_PRIVATE_KEY
    ),
    GOOGLE_SHEETS_STOCKAGES_SPREADSHEET_ID: emptyToUndefined(
      process.env.GOOGLE_SHEETS_STOCKAGES_SPREADSHEET_ID
    )
  });

  if (!parsed.success) {
    throw new Error("Configuration Google Sheets Stockages incomplète.");
  }

  const credentials = getServiceAccountCredentials(parsed.data);
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Identifiants Google Sheets Stockages incomplets.");
  }

  return {
    clientEmail: credentials.client_email,
    privateKey: normalizePrivateKey(credentials.private_key),
    spreadsheetId: normalizeSpreadsheetId(
      parsed.data.GOOGLE_SHEETS_STOCKAGES_SPREADSHEET_ID
    )
  };
}

async function readStockagesRanges(
  config: StockagesGoogleSheetsConfig,
  accessToken: string,
  sheetTitles: ReadonlySet<string>
) {
  const selectedRanges = STOCKAGES_SHEET_NAMES.filter((sheetName) =>
    sheetTitles.has(sheetName)
  ).map((sheetName) => READ_ONLY_RANGES[sheetName]);
  if (selectedRanges.length === 0) {
    return [];
  }

  const searchParams = new URLSearchParams({
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING"
  });

  selectedRanges.forEach((range) => searchParams.append("ranges", range));

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      config.spreadsheetId
    )}/values:batchGet?${searchParams.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    }
  );
  const payload = (await response.json()) as GoogleSheetsBatchResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "Lecture de STOCKAGES PUBLIC impossible."
    );
  }

  return payload.valueRanges ?? [];
}

async function readStockagesSheetTitles(
  config: StockagesGoogleSheetsConfig,
  accessToken: string
) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      config.spreadsheetId
    )}?fields=sheets.properties.title`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    }
  );
  const payload = (await response.json()) as GoogleSheetsMetadataResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "Lecture de la structure Stockages impossible."
    );
  }

  return new Set(
    (payload.sheets ?? [])
      .map((sheet) => sheet.properties?.title?.trim())
      .filter((title): title is string => Boolean(title))
  );
}

async function getGoogleAccessToken(config: StockagesGoogleSheetsConfig) {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createServiceAccountAssertion(config)
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Authentification Google Sheets impossible."
    );
  }

  tokenCache = {
    token: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000
  };
  return tokenCache.token;
}

function createServiceAccountAssertion(config: StockagesGoogleSheetsConfig) {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const unsignedToken = `${toBase64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  )}.${toBase64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      exp: nowInSeconds + 3600,
      iat: nowInSeconds
    })
  )}`;
  const signer = createSign("RSA-SHA256");

  signer.update(unsignedToken);
  signer.end();

  return `${unsignedToken}.${toBase64Url(signer.sign(config.privateKey))}`;
}

function parseParameters(rows: unknown[][]) {
  const parameters = new Map<string, string>();

  rows.slice(1).forEach((row) => {
    const key = getCell(row, 0);
    if (key) {
      parameters.set(key, getCell(row, 1));
    }
  });

  return parameters;
}

function parseInitialBalances(
  rows: unknown[][],
  allowedSites: readonly StockagesSite[]
): StockagesInitialBalanceStatus[] {
  const bySite = new Map<StockagesSite, StockagesInitialBalanceStatus["status"]>();

  rows.slice(1).forEach((row) => {
    const site = normalizeSite(getCell(row, 1));
    if (!site) {
      return;
    }

    const rawStatus = normalizeText(getCell(row, 6));
    const status =
      rawStatus === "BROUILLON" || rawStatus === "VALIDE"
        ? rawStatus === "VALIDE"
          ? "VALIDÉ"
          : "BROUILLON"
        : null;
    bySite.set(site, status);
  });

  return allowedSites.map((site) => ({
    site,
    status: bySite.get(site) ?? null
  }));
}

function findLastAuditEvent(rows: unknown[][], action: string) {
  for (let index = rows.length - 1; index >= 1; index -= 1) {
    const row = rows[index];
    if (getCell(row, 2) !== action) {
      continue;
    }

    return {
      date: getCell(row, 0),
      result: getCell(row, 7),
      details: parseJsonRecord(getCell(row, 8))
    };
  }

  return null;
}

function extractBlockingAnomalyCount(details: Record<string, unknown> | null) {
  if (!details) {
    return null;
  }

  const directKeys = [
    "anomaliesBloquantes",
    "nombreAnomaliesBloquantes",
    "nombreBloquantes",
    "nombreBloques"
  ];

  for (const key of directKeys) {
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  const compteurs = details.compteurs;
  if (isRecord(compteurs)) {
    for (const key of directKeys) {
      const value = compteurs[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return value;
      }
    }
  }

  return null;
}

function findLastUpdateDate(rows: unknown[][]) {
  for (let index = rows.length - 1; index >= 1; index -= 1) {
    const date = getCell(rows[index], 0);
    if (date) {
      return date;
    }
  }

  return null;
}

function createSheetAvailability(
  titles: ReadonlySet<string>
): StockagesSheetAvailability {
  return Object.fromEntries(
    STOCKAGES_SHEET_NAMES.map((name) => [name, titles.has(name)])
  ) as StockagesSheetAvailability;
}

function createAdminSource(
  valueRanges: GoogleValueRange[],
  availability: StockagesSheetAvailability
) {
  return {
    availability,
    available: (name: StockagesSheetName) => availability[name],
    rows: (name: StockagesSheetName) =>
      availability[name] ? getRows(valueRanges, name) : []
  };
}

function parseAdminInitialBalances(
  rows: unknown[][],
  activated: boolean
): AdminInitialBalance[] {
  const bySite = new Map<StockagesSite, AdminInitialBalance>();

  rows.slice(1).forEach((row) => {
    const site = normalizeSite(getCell(row, 1));
    if (!site) {
      return;
    }
    const normalizedStatus = normalizeText(getCell(row, 6));
    bySite.set(site, {
      site,
      status:
        normalizedStatus === "VALIDE"
          ? "VALIDÉ"
          : normalizedStatus === "BROUILLON"
            ? "BROUILLON"
            : null,
      activationDate: getCell(row, 2) || null,
      initialParcels: activated ? parseOptionalNumber(getCell(row, 3)) : null,
      initialKilograms: activated ? parseOptionalNumber(getCell(row, 4)) : null,
      validatedBy: getCell(row, 7) || null,
      validatedAt: getCell(row, 8) || null
    });
  });

  return STOCKAGES_SITES.map(
    (site): AdminInitialBalance =>
      bySite.get(site) ?? {
        site,
        status: null,
        activationDate: null,
        initialParcels: null,
        initialKilograms: null,
        validatedBy: null,
        validatedAt: null
      }
  );
}

function parseAdminAgencyStocks(
  rows: unknown[][],
  available: boolean
): AdminAgencyStock[] {
  if (!available) {
    return STOCKAGES_SITES.map((site) => emptyAgencyStock(site));
  }

  const parsed = parseTable<AdminAgencyStock[]>(rows, (row) => {
    const site = normalizeSite(readNamedCell(row, ["AGENCE", "SITE"]));
    if (!site) {
      return [];
    }
    const finalParcels = parseOptionalNumber(
      readNamedCell(row, ["STOCK FINAL COLIS", "STOCK_FINAL_COLIS"])
    );
    const finalKilograms = parseOptionalNumber(
      readNamedCell(row, ["STOCK FINAL KG", "STOCK_FINAL_KG"])
    );
    return [{
      site,
      available: true,
      initialParcels: namedNumber(row, ["STOCK INITIAL COLIS", "STOCK_INITIAL_COLIS"]),
      initialKilograms: namedNumber(row, ["STOCK INITIAL KG", "STOCK_INITIAL_KG"]),
      inboundParcels: namedNumber(row, ["ENTREES COLIS", "ENTRÉES COLIS"]),
      inboundKilograms: namedNumber(row, ["ENTREES KG", "ENTRÉES KG"]),
      outboundParcels: namedNumber(row, ["SORTIES COLIS"]),
      outboundKilograms: namedNumber(row, ["SORTIES KG"]),
      adjustmentParcels: namedNumber(row, ["AJUSTEMENTS COLIS"]),
      adjustmentKilograms: namedNumber(row, ["AJUSTEMENTS KG"]),
      finalParcels,
      finalKilograms,
      status:
        finalParcels !== null &&
        finalKilograms !== null &&
        (finalParcels < 0 || finalKilograms < 0)
          ? ("ALERTE_STOCK_NEGATIF" as const)
          : ("OK" as const)
    } satisfies AdminAgencyStock];
  }).flat();
  const bySite = new Map(parsed.map((stock) => [stock.site, stock]));
  return STOCKAGES_SITES.map((site) => bySite.get(site) ?? emptyAgencyStock(site));
}

function emptyAgencyStock(site: StockagesSite): AdminAgencyStock {
  return {
    site,
    available: false,
    initialParcels: null,
    initialKilograms: null,
    inboundParcels: null,
    inboundKilograms: null,
    outboundParcels: null,
    outboundKilograms: null,
    adjustmentParcels: null,
    adjustmentKilograms: null,
    finalParcels: null,
    finalKilograms: null,
    status: null
  };
}

function parseAdminAnomalies(source: Awaited<ReturnType<typeof readAdminStockagesSource>>) {
  const anomalies: AdminStockagesAnomaly[] = [];
  const append = (
    sheet: StockagesSheetName,
    fallbackCategory: StockagesAnomalyCategory
  ) => {
    parseTable(source.rows(sheet), (row, index) => {
      const category = classifyAnomaly(
        readNamedCell(row, ["TYPE", "CATEGORIE", "CATÉGORIE", "STATUT"]),
        fallbackCategory
      );
      anomalies.push({
        id: `${sheet}-${index + 2}`,
        date: readNamedCell(row, ["DATE", "HORODATAGE"]),
        category,
        site: normalizeSite(readNamedCell(row, ["AGENCE", "SITE"])),
        reference: readNamedCell(row, ["REFERENCE", "RÉFÉRENCE", "CODE COLIS"]),
        details: readNamedCell(row, [
          "DETAILS",
          "DÉTAILS",
          "MESSAGE",
          "OBSERVATION"
        ])
      });
      return null;
    });
  };

  append("ANOMALIES MANIFESTE", "ANOMALIE_BLOQUANTE");
  append("EXCLUSIONS PHOTOGRAPHIE", "EXCLUSION_INVALIDE");
  parseAuditEntries(source.rows("AUDIT"))
    .filter((entry) => normalizeText(entry.result).includes("ERREUR"))
    .forEach((entry) => {
      anomalies.push({
        id: `sync-${entry.id}`,
        date: entry.date,
        category: "ERREUR_SYNCHRONISATION",
        site: entry.site,
        reference: entry.reference,
        details: entry.details
      });
    });
  return anomalies;
}

function classifyAnomaly(
  value: string,
  fallback: StockagesAnomalyCategory
): StockagesAnomalyCategory {
  const normalized = normalizeText(value);
  if (normalized.includes("DOUBLON")) {
    return "DOUBLON";
  }
  if (normalized.includes("NON RETROUV")) {
    return "EXCLUSION_NON_RETROUVEE";
  }
  if (normalized.includes("EXCLUSION") && normalized.includes("INVALID")) {
    return "EXCLUSION_INVALIDE";
  }
  if (normalized.includes("STOCK") && normalized.includes("NEGAT")) {
    return "STOCK_NEGATIF";
  }
  return fallback;
}

function parseAuditEntries(rows: unknown[][]): AdminStockagesAuditEntry[] {
  if (rows.length < 2) {
    return [];
  }
  return rows.slice(1).map((row, index) => ({
    id: `audit-${index + 2}`,
    date: getCell(row, 0),
    user: getCell(row, 1),
    action: getCell(row, 2),
    site: normalizeSite(getCell(row, 3)),
    reference: getCell(row, 4),
    result: getCell(row, 7),
    details: getCell(row, 8)
  }));
}

type NamedRow = Map<string, string>;

function parseTable<T>(
  rows: unknown[][],
  parse: (row: NamedRow, index: number) => T
): T[] {
  if (rows.length < 2) {
    return [];
  }
  const headers = rows[0].map((cell) => normalizeText(String(cell ?? "")));
  return rows.slice(1).map((row, index) => {
    const named = new Map<string, string>();
    headers.forEach((header, column) => named.set(header, getCell(row, column)));
    return parse(named, index);
  });
}

function readNamedCell(row: NamedRow, names: string[]) {
  for (const name of names) {
    const value = row.get(normalizeText(name));
    if (value) {
      return value;
    }
  }
  return "";
}

function namedNumber(row: NamedRow, names: string[]) {
  return parseOptionalNumber(readNamedCell(row, names));
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesFilter(value: string, filter: string, partial = false) {
  if (!filter || normalizeText(filter) === "ALL") {
    return true;
  }
  const normalizedValue = normalizeText(value);
  const normalizedFilter = normalizeText(filter);
  return partial
    ? normalizedValue.includes(normalizedFilter)
    : normalizedValue === normalizedFilter;
}

function lastNonEmptyDate(rows: unknown[][]) {
  for (let index = rows.length - 1; index >= 1; index -= 1) {
    const date = getCell(rows[index], 0);
    if (date) {
      return date;
    }
  }
  return null;
}

function countAnomalies(
  anomalies: AdminStockagesAnomaly[],
  category: StockagesAnomalyCategory
) {
  return anomalies.filter((anomaly) => anomaly.category === category).length;
}

function getRows(valueRanges: GoogleValueRange[], sheetName: string) {
  return (
    valueRanges.find((valueRange) =>
      valueRange.range?.startsWith(`${sheetName}!`)
    )?.values ?? []
  );
}

function normalizeSite(value: string): StockagesSite | null {
  const normalized = normalizeText(value);
  if (normalized === "COTONOU") {
    return "COO";
  }

  return STOCKAGES_SITES.includes(normalized as StockagesSite)
    ? (normalized as StockagesSite)
    : null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function getCell(row: unknown[], index: number) {
  const value = row[index];
  return value === null || typeof value === "undefined"
    ? ""
    : String(value).trim();
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getServiceAccountCredentials(
  env: z.infer<typeof stockagesSheetsEnvSchema>
): ServiceAccountCredentials {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    return parseServiceAccountJson(
      Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8")
    );
  }

  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return parseServiceAccountJson(
      readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
    );
  }

  return {
    client_email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
    private_key: env.GOOGLE_SHEETS_PRIVATE_KEY
  };
}

function parseServiceAccountJson(value: string): ServiceAccountCredentials {
  try {
    return JSON.parse(value) as ServiceAccountCredentials;
  } catch {
    throw new Error("Identifiants Google Sheets Stockages invalides.");
  }
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function normalizeSpreadsheetId(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? trimmed;
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
