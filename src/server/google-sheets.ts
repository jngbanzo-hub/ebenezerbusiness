import { createSign } from "crypto";
import { readFileSync } from "fs";

import { z } from "zod";

import type { PublicTrackingRecord } from "@/features/tracking/tracking-data";
import type { TrackingSite } from "@/features/tracking/tracking-validation";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const DEFAULT_TRACKING_SHEETS = ["FIH", "LSHI", "KLZ"] as const;

const sheetsEnvSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_SHEETS_CLIENT_EMAIL: z.string().email().optional(),
  GOOGLE_SHEETS_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1),
  GOOGLE_SHEETS_TRACKING_TABS: z.string().min(1).default(DEFAULT_TRACKING_SHEETS.join(","))
});

type GoogleSheetsConfig = {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
  trackingTabs: string;
};

type ServiceAccountCredentials = {
  type?: string;
  client_email?: string;
  private_key?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleSheetsValuesResponse = {
  values?: string[][];
  error?: {
    message?: string;
  };
};

let tokenCache: { token: string; expiresAt: number } | null = null;

export function isGoogleSheetsConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
      (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY))
  );
}

export async function findPublicTrackingRecordByCode(
  trackingCode: string,
  trackingSite?: TrackingSite
): Promise<PublicTrackingRecord | null> {
  const config = getGoogleSheetsConfig();
  const normalizedTrackingCode = normalizeTrackingCode(trackingCode);
  const sheetNames = trackingSite ? [trackingSite] : getTrackingSheetNames(config);

  for (const sheetName of sheetNames) {
    const rows = await readSheetValues(config, `${sheetName}!A:H`);
    const record = findRecordInRows(rows, normalizedTrackingCode, sheetName);

    if (record) {
      return record;
    }
  }

  return null;
}

function getGoogleSheetsConfig(): GoogleSheetsConfig {
  const parsed = sheetsEnvSchema.safeParse({
    GOOGLE_SERVICE_ACCOUNT_JSON: emptyToUndefined(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: emptyToUndefined(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
    ),
    GOOGLE_APPLICATION_CREDENTIALS: emptyToUndefined(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    GOOGLE_SHEETS_CLIENT_EMAIL: emptyToUndefined(process.env.GOOGLE_SHEETS_CLIENT_EMAIL),
    GOOGLE_SHEETS_PRIVATE_KEY: emptyToUndefined(process.env.GOOGLE_SHEETS_PRIVATE_KEY),
    GOOGLE_SHEETS_SPREADSHEET_ID: emptyToUndefined(process.env.GOOGLE_SHEETS_SPREADSHEET_ID),
    GOOGLE_SHEETS_TRACKING_TABS:
      emptyToUndefined(process.env.GOOGLE_SHEETS_TRACKING_TABS) ??
      DEFAULT_TRACKING_SHEETS.join(",")
  });

  if (!parsed.success) {
    throw new Error("Configuration Google Sheets incomplète.");
  }

  const credentials = getServiceAccountCredentials(parsed.data);

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Identifiants du compte de service Google incomplets.");
  }

  return {
    clientEmail: credentials.client_email,
    privateKey: normalizePrivateKey(credentials.private_key),
    spreadsheetId: normalizeSpreadsheetId(parsed.data.GOOGLE_SHEETS_SPREADSHEET_ID),
    trackingTabs: parsed.data.GOOGLE_SHEETS_TRACKING_TABS
  };
}

async function readSheetValues(config: GoogleSheetsConfig, range: string): Promise<string[][]> {
  const accessToken = await getGoogleAccessToken(config);
  const spreadsheetId = encodeURIComponent(config.spreadsheetId);
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?majorDimension=ROWS`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    }
  );
  const payload = (await response.json()) as GoogleSheetsValuesResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Lecture Google Sheets impossible.");
  }

  return payload.values ?? [];
}

async function getGoogleAccessToken(config: GoogleSheetsConfig) {
  const now = Date.now();

  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const assertion = createServiceAccountAssertion(config);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }),
    cache: "no-store"
  });
  const payload = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ?? payload.error ?? "Authentification Google Sheets impossible."
    );
  }

  tokenCache = {
    token: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000
  };

  return payload.access_token;
}

function createServiceAccountAssertion(config: GoogleSheetsConfig) {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const claimSet = {
    iss: config.clientEmail,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: nowInSeconds + 3600,
    iat: nowInSeconds
  };
  const unsignedToken = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(
    JSON.stringify(claimSet)
  )}`;
  const signer = createSign("RSA-SHA256");

  signer.update(unsignedToken);
  signer.end();

  return `${unsignedToken}.${toBase64Url(signer.sign(config.privateKey))}`;
}

function findRecordInRows(
  rows: string[][],
  normalizedTrackingCode: string,
  sheetName: string
) {
  for (const row of rows) {
    const trackingId = getCell(row, 0);

    if (isHeaderRow(trackingId)) {
      continue;
    }

    if (normalizeTrackingCode(trackingId) === normalizedTrackingCode) {
      return parsePublicTrackingRow(row, sheetName);
    }
  }

  return null;
}

function parsePublicTrackingRow(row: string[], sheetName: string): PublicTrackingRecord {
  return {
    trackingId: getCell(row, 0),
    customerName: getCell(row, 1) || "Non renseigné",
    site: getCell(row, 2) || sheetName,
    weight: getCell(row, 3) || "Non renseigné",
    amount: getCell(row, 4) || "Non renseigné",
    status: getCell(row, 5) || "Non renseigné",
    destination: getCell(row, 6) || "Non renseigné",
    expectedDeliveryDate: getCell(row, 7) || "Non renseigné"
  };
}

function getTrackingSheetNames(config: GoogleSheetsConfig) {
  return config.trackingTabs
    .split(",")
    .map((sheetName) => sheetName.trim())
    .filter(Boolean);
}

function getServiceAccountCredentials(
  env: z.infer<typeof sheetsEnvSchema>
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
    return parseServiceAccountJson(readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  }

  return {
    client_email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
    private_key: env.GOOGLE_SHEETS_PRIVATE_KEY
  };
}

function parseServiceAccountJson(value: string): ServiceAccountCredentials {
  const credentials = JSON.parse(value) as ServiceAccountCredentials;

  if (credentials.type && credentials.type !== "service_account") {
    throw new Error("Le fichier Google fourni n'est pas un compte de service.");
  }

  return credentials;
}

function isHeaderRow(value: string) {
  return normalizeHeader(value) === "tracking_id";
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeTrackingCode(value: string) {
  return value.trim().toUpperCase();
}

function emptyToUndefined(value: string | undefined) {
  return value?.trim() ? value : undefined;
}

function normalizeSpreadsheetId(value: string) {
  const trimmedValue = value.trim();
  const urlMatch = trimmedValue.match(/\/spreadsheets\/d\/([^/]+)/);

  return urlMatch?.[1] ?? trimmedValue;
}

function normalizePrivateKey(value: string) {
  return value.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

function getCell(row: string[], index: number) {
  return String(row[index] ?? "").trim();
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
