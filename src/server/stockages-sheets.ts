import "server-only";

import { createSign } from "crypto";
import { readFileSync } from "fs";

import { z } from "zod";

import {
  STOCKAGES_SITES,
  type StockagesInitialBalanceStatus,
  type StockagesPreparationStatus,
  type StockagesSite
} from "@/features/stockages/types";
import { assertStockagesPreparationMode } from "@/server/stockages-feature-flags";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const READ_ONLY_RANGES = [
  "PARAMETRES!A:E",
  "SOLDE INITIAL!A:I",
  "AUDIT!A:J"
] as const;

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
  const [valueRanges, sheetTitles] = await Promise.all([
    readStockagesRanges(config, accessToken),
    readStockagesSheetTitles(config, accessToken)
  ]);
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
  accessToken: string
) {
  const searchParams = new URLSearchParams({
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING"
  });

  READ_ONLY_RANGES.forEach((range) => searchParams.append("ranges", range));

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
