import "server-only";

import { createSign } from "crypto";
import { readFileSync } from "fs";

import { z } from "zod";

import {
  MANIFEST_SITES,
  type ManifestShipperRow,
  type ManifestSite
} from "@/features/admin/types";
import { detectManifestHeaderMap } from "@/server/manifest-header-map";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";

const manifestSheetsEnvSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_SHEETS_CLIENT_EMAIL: z.string().email().optional(),
  GOOGLE_SHEETS_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_SHEETS_MANIFEST_SPREADSHEET_ID: z.string().min(1)
});

type ManifestGoogleSheetsConfig = {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
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

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function readAdminManifestRows(): Promise<ManifestShipperRow[]> {
  const config = getManifestGoogleSheetsConfig();
  return readManifestRows(config);
}

export async function readCanonicalPaymentManifestRows(): Promise<ManifestShipperRow[]> {
  const config = getManifestGoogleSheetsConfig();
  const spreadsheetId = emptyToUndefined(process.env.GOOGLE_SHEETS_PAYMENTS_SOURCE_SPREADSHEET_ID);
  if (!spreadsheetId) {
    throw new Error("Configuration de la source canonique Encaissements incomplète.");
  }
  return readManifestRows({ ...config, spreadsheetId: normalizeSpreadsheetId(spreadsheetId) });
}

async function readManifestRows(config: ManifestGoogleSheetsConfig): Promise<ManifestShipperRow[]> {
  const valueRanges = await readManifestRanges(config);
  const rows: ManifestShipperRow[] = [];

  for (const site of MANIFEST_SITES) {
    const valueRange = valueRanges.find(
      (candidate) => getSiteFromRange(candidate.range) === site
    );

    const values = valueRange?.values ?? [];
    const headerMap = detectManifestHeaderMap(values);
    const sampleStatus = headerMap.statusIndex >= 0
      ? getCell(values.slice(headerMap.headerRowIndex + 1).find((row) => getCell(row, headerMap.statusIndex)) ?? [], headerMap.statusIndex)
      : "";
    console.info("[manifest-status-mapping]", JSON.stringify({
      site,
      headers: headerMap.headers,
      statusIndex: headerMap.statusIndex,
      sampleStatus
    }));

    values.forEach((row, index) => {
      if (index === headerMap.headerRowIndex || isManifestHeaderRow(row) || isEmptyRow(row)) {
        return;
      }

      rows.push({
        sourceSite: site,
        rowNumber: index + 1,
        dateRaw: getCell(row, 0),
        codeColisRaw: getCell(row, 1),
        expediteurRaw: getCell(row, 2),
        poidsRaw: getCell(row, 4),
        montantAttenduRaw: getCell(row, 5),
        statutRaw: headerMap.statusIndex >= 0 ? getCell(row, headerMap.statusIndex) : ""
      });
    });
  }

  return rows;
}

export async function readAdminManifestRange(range: string): Promise<unknown[][]> {
  const config = getManifestGoogleSheetsConfig();
  const accessToken = await getGoogleAccessToken(config);
  const spreadsheetId = encodeURIComponent(config.spreadsheetId);
  const searchParams = new URLSearchParams({
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE"
  });
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?${searchParams.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }
  );
  const payload = (await response.json()) as GoogleValueRange & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Lecture du Manifeste impossible.");
  }

  const validated = z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).safeParse(payload.values ?? []);
  if (!validated.success) {
    throw new Error("Réponse Google Sheets invalide.");
  }
  return validated.data;
}

function getManifestGoogleSheetsConfig(): ManifestGoogleSheetsConfig {
  const parsed = manifestSheetsEnvSchema.safeParse({
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
    GOOGLE_SHEETS_MANIFEST_SPREADSHEET_ID: emptyToUndefined(
      process.env.GOOGLE_SHEETS_MANIFEST_SPREADSHEET_ID
    )
  });

  if (!parsed.success) {
    throw new Error("Configuration du Manifeste Public incomplète.");
  }

  const credentials = getServiceAccountCredentials(parsed.data);
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Identifiants Google Sheets incomplets.");
  }

  return {
    clientEmail: credentials.client_email,
    privateKey: normalizePrivateKey(credentials.private_key),
    spreadsheetId: normalizeSpreadsheetId(
      parsed.data.GOOGLE_SHEETS_MANIFEST_SPREADSHEET_ID
    )
  };
}

async function readManifestRanges(config: ManifestGoogleSheetsConfig) {
  const accessToken = await getGoogleAccessToken(config);
  const spreadsheetId = encodeURIComponent(config.spreadsheetId);
  const searchParams = new URLSearchParams({
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE"
  });

  for (const site of MANIFEST_SITES) {
    searchParams.append("ranges", `${site}!A:Z`);
  }

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${searchParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    }
  );
  const payload = (await response.json()) as GoogleSheetsBatchResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Lecture du Manifeste impossible.");
  }

  return payload.valueRanges ?? [];
}

async function getGoogleAccessToken(config: ManifestGoogleSheetsConfig) {
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
        "Authentification Google impossible."
    );
  }

  tokenCache = {
    token: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000
  };

  return tokenCache.token;
}

function createServiceAccountAssertion(config: ManifestGoogleSheetsConfig) {
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

function getServiceAccountCredentials(
  env: z.infer<typeof manifestSheetsEnvSchema>
): ServiceAccountCredentials {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    return parseServiceAccountJson(
      Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString(
        "utf8"
      )
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
  const credentials = JSON.parse(value) as ServiceAccountCredentials;

  if (credentials.type && credentials.type !== "service_account") {
    throw new Error("Le fichier Google fourni n’est pas un compte de service.");
  }

  return credentials;
}

function getSiteFromRange(range: string | undefined): ManifestSite | null {
  if (!range) {
    return null;
  }

  const normalized = range
    .split("!")[0]
    ?.replace(/^'|'$/g, "")
    .toUpperCase();
  return MANIFEST_SITES.includes(normalized as ManifestSite)
    ? (normalized as ManifestSite)
    : null;
}

function isManifestHeaderRow(row: unknown[]) {
  return (
    normalizeHeader(getCell(row, 0)) === "date" &&
    normalizeHeader(getCell(row, 1)) === "code colis"
  );
}

function isEmptyRow(row: unknown[]) {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

function getCell(row: unknown[], index: number) {
  return String(row[index] ?? "").trim();
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function emptyToUndefined(value: string | undefined) {
  return value?.trim() ? value : undefined;
}

function normalizeSpreadsheetId(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.match(/\/spreadsheets\/d\/([^/]+)/)?.[1] ?? trimmedValue;
}

function normalizePrivateKey(value: string) {
  return value.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
