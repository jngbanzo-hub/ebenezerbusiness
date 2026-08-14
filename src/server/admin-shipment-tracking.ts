import "server-only";

import { createSign } from "crypto";
import { readFileSync } from "fs";

import { z } from "zod";

import { parseShipmentTrackingRows, SHIPMENT_TRACKING_SHEET, type ShipmentStatus } from "@/features/admin/shipment-tracking";
import type { OperationPerformanceTrace } from "@/server/operation-performance";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const envSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(), GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(), GOOGLE_SHEETS_CLIENT_EMAIL: z.string().email().optional(),
  GOOGLE_SHEETS_PRIVATE_KEY: z.string().min(1).optional(), GOOGLE_SHEETS_SHIPMENT_TRACKING_SPREADSHEET_ID: z.string().min(1)
});
type Config = { clientEmail: string; privateKey: string; spreadsheetId: string };
let tokenCache: { token: string; expiresAt: number } | null = null;

export async function readShipmentTrackingRows(trace?: OperationPerformanceTrace) {
  const values = await readRange(`${SHIPMENT_TRACKING_SHEET}!A:N`, 1, trace);
  const startedAt = performance.now();
  const rows = parseShipmentTrackingRows(values);
  trace?.add("parsing_expedition", performance.now() - startedAt);
  return rows;
}

export async function updateShipmentStatus(rowNumber: number, identity: string, status: ShipmentStatus, trace?: OperationPerformanceTrace) {
  const beforeValues = await readRange(`${SHIPMENT_TRACKING_SHEET}!A${rowNumber}:N${rowNumber}`, rowNumber, trace, "lecture_google");
  const identityStartedAt = performance.now();
  const before = parseShipmentTrackingRows(beforeValues);
  const target = before[0];
  if (!target || target.rowNumber !== rowNumber || target.identity !== identity) throw new Error("Le groupage ciblé a changé. Rafraîchissez la page.");
  trace?.add("validation_identite", performance.now() - identityStartedAt);
  await writeStatusCell(rowNumber, status, trace);
  const afterValues = await readRange(`${SHIPMENT_TRACKING_SHEET}!A${rowNumber}:N${rowNumber}`, rowNumber, trace, "relecture_google");
  const confirmationStartedAt = performance.now();
  const after = parseShipmentTrackingRows(afterValues);
  const confirmed = after[0];
  if (!confirmed || confirmed.identity !== identity || confirmed.status !== status) throw new Error("La valeur réelle de la colonne K ne confirme pas la mise à jour.");
  trace?.add("confirmation_relecture", performance.now() - confirmationStartedAt);
  console.info("[admin-shipment-status-updated]", JSON.stringify({ rowNumber, identity, status }));
  return confirmed;
}

async function readRange(range: string, sourceRowNumber = 1, trace?: OperationPerformanceTrace, readStep = "google_sheets"): Promise<unknown[][]> {
  const config = getConfig();
  const token = trace ? await trace.measure("google_token", () => getToken(config)) : await getToken(config);
  const readSheets = () => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const response = trace ? await trace.measure(readStep, readSheets) : await readSheets();
  const payload = await response.json() as { values?: unknown[][]; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Lecture du suivi des expéditions impossible.");
  const values = payload.values ?? [];
  if (sourceRowNumber === 1) return values;
  return [["Date", "Compagnie", "Destination", "", "", "Groupage", "", "", "", "", "Statut"], ...Array.from({ length: Math.max(0, sourceRowNumber - 2) }, () => []), ...(values as unknown[][])];
}

async function writeStatusCell(rowNumber: number, status: ShipmentStatus, trace?: OperationPerformanceTrace) {
  const config = getConfig(); const token = trace ? await trace.measure("google_token", () => getToken(config)) : await getToken(config); const range = `${SHIPMENT_TRACKING_SHEET}!K${rowNumber}`;
  const write = () => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ range, majorDimension: "ROWS", values: [[status]] }), cache: "no-store" });
  const response = trace ? await trace.measure("ecriture_google", write) : await write();
  const payload = await response.json() as { updatedRange?: string; updatedCells?: number; error?: { message?: string } };
  if (!response.ok || payload.updatedCells !== 1 || !payload.updatedRange?.toUpperCase().endsWith(`!K${rowNumber}`)) throw new Error(payload.error?.message ?? "Écriture de la colonne K impossible.");
}

function getConfig(): Config {
  const parsed = envSchema.safeParse(Object.fromEntries(Object.keys(envSchema.shape).map((key) => [key, process.env[key]?.trim() || undefined])));
  if (!parsed.success) throw new Error("Configuration Google Sheets du manifeste incomplète.");
  let credentials: { client_email?: string; private_key?: string } = {};
  if (parsed.data.GOOGLE_SERVICE_ACCOUNT_JSON) credentials = JSON.parse(parsed.data.GOOGLE_SERVICE_ACCOUNT_JSON);
  else if (parsed.data.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) credentials = JSON.parse(Buffer.from(parsed.data.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8"));
  else if (parsed.data.GOOGLE_APPLICATION_CREDENTIALS) credentials = JSON.parse(readFileSync(parsed.data.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  else credentials = { client_email: parsed.data.GOOGLE_SHEETS_CLIENT_EMAIL, private_key: parsed.data.GOOGLE_SHEETS_PRIVATE_KEY };
  if (!credentials.client_email || !credentials.private_key) throw new Error("Identifiants Google Sheets incomplets.");
  const rawId = parsed.data.GOOGLE_SHEETS_SHIPMENT_TRACKING_SPREADSHEET_ID.trim();
  return { clientEmail: credentials.client_email, privateKey: credentials.private_key.replace(/^"|"$/g, "").replace(/\\n/g, "\n"), spreadsheetId: rawId.match(/\/spreadsheets\/d\/([^/]+)/)?.[1] ?? rawId };
}

async function getToken(config: Config) {
  const now = Date.now(); if (tokenCache && tokenCache.expiresAt > now + 60000) return tokenCache.token;
  const iat = Math.floor(now / 1000); const unsigned = `${base64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64(JSON.stringify({ iss: config.clientEmail, scope: GOOGLE_SHEETS_SCOPE, aud: GOOGLE_TOKEN_URL, exp: iat + 3600, iat }))}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end(); const assertion = `${unsigned}.${base64(signer.sign(config.privateKey))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), cache: "no-store" });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description ?? "Authentification Google impossible.");
  tokenCache = { token: payload.access_token, expiresAt: now + (payload.expires_in ?? 3600) * 1000 }; return tokenCache.token;
}
function base64(value: string | Buffer) { return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
