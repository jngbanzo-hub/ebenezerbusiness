import "server-only";

import {
  createHash,
  createHmac,
  randomUUID
} from "node:crypto";

import type { TransferAgency } from "@/features/transferts/types";

export const TRANSFERTS_READ_ACTIONS = [
  "GET_TRANSFER",
  "LIST_AGENCY_TRANSFERS",
  "LIST_ADMIN_TRANSFERS",
  "LIST_ADMIN_AUDIT"
] as const;

export type TransfertsReadAction = (typeof TRANSFERTS_READ_ACTIONS)[number];

export type TransfertsActor = {
  userId: string;
  email: string;
  role: "AGENT" | "ADMIN";
  agency: TransferAgency;
};

type AppsScriptResponse = {
  ok: boolean;
  requestId: string;
  action: string;
  data: unknown;
  error: null | { code: string; message: string };
};

export class TransfertsConfigurationError extends Error {}
export class TransfertsServiceError extends Error {}

export async function callTransfertsReadApi(
  action: TransfertsReadAction,
  actor: TransfertsActor,
  payload: Record<string, unknown>,
  options: { fetcher?: typeof fetch; now?: number } = {}
): Promise<unknown> {
  const config = readTransfertsConfiguration();
  const timestamp = String(options.now ?? Date.now());
  const requestId = randomUUID();
  const nonce = randomUUID();
  const actorAgency = actor.agency.toUpperCase();
  const signatureBase = buildTransfertsSignatureBase({
    timestamp,
    nonce,
    requestId,
    action,
    actorUserId: actor.userId,
    actorAgency,
    payload
  });
  const signature = signTransfertsRequest(config.hmacSecret, signatureBase);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await (options.fetcher ?? fetch)(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: config.apiKey,
        action,
        requestId,
        timestamp,
        nonce,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        actorAgency,
        payload,
        signature
      }),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new TransfertsServiceError("TRANSFERTS_SERVICE_REJECTED");
    }
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      throw new TransfertsServiceError("TRANSFERTS_INVALID_RESPONSE");
    }

    const parsed: unknown = await response.json();
    const validated = validateAppsScriptResponse(parsed, requestId, action);
    if (!validated.ok) {
      throw new TransfertsServiceError(validated.error?.code ?? "TRANSFERTS_SERVICE_ERROR");
    }
    return stripFullTransferCodes(validated.data);
  } finally {
    clearTimeout(timeout);
  }
}

export function canonicalizeTransfertsPayload(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeTransfertsPayload).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalizeTransfertsPayload(record[key])}`
      )
      .join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("NON_FINITE_NUMBER");
  }
  return JSON.stringify(value);
}

export function buildTransfertsSignatureBase(input: {
  timestamp: string;
  nonce: string;
  requestId: string;
  action: string;
  actorUserId: string;
  actorAgency: string;
  payload: unknown;
}) {
  const payloadHash = createHash("sha256")
    .update(canonicalizeTransfertsPayload(input.payload))
    .digest("hex");
  return [
    input.timestamp,
    input.nonce,
    input.requestId,
    input.action,
    input.actorUserId,
    input.actorAgency.toUpperCase(),
    payloadHash
  ].join("|");
}

export function signTransfertsRequest(secret: string, signatureBase: string) {
  return createHmac("sha256", secret).update(signatureBase).digest("hex");
}

export function stripFullTransferCodes(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripFullTransferCodes);
  }
  if (value && typeof value === "object") {
    const safe: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (!isSensitiveResponseKey(key)) {
        safe[key] = stripFullTransferCodes(child);
      }
    }
    return safe;
  }
  return value;
}

function isSensitiveResponseKey(key: string) {
  return [
    "transfercode",
    "apikey",
    "signature",
    "nonce",
    "hmacsecret",
    "password",
    "secret"
  ].includes(key.replace(/[_-]/g, "").toLowerCase());
}

function readTransfertsConfiguration() {
  const url = process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL?.trim();
  const apiKey = process.env.TRANSFERTS_API_KEY;
  const hmacSecret = process.env.TRANSFERTS_HMAC_SECRET;
  if (!url || !apiKey || !hmacSecret) {
    throw new TransfertsConfigurationError("TRANSFERTS_NOT_CONFIGURED");
  }
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "script.google.com" ||
    !parsed.pathname.endsWith("/exec")
  ) {
    throw new TransfertsConfigurationError("TRANSFERTS_INVALID_SERVER_URL");
  }
  return { url: parsed.toString(), apiKey, hmacSecret };
}

function validateAppsScriptResponse(
  value: unknown,
  requestId: string,
  action: string
): AppsScriptResponse {
  if (!isRecord(value)) throw new TransfertsServiceError("TRANSFERTS_INVALID_RESPONSE");
  if (
    Object.keys(value).sort().join(",") !==
    "action,data,error,ok,requestId"
  ) {
    throw new TransfertsServiceError("TRANSFERTS_INVALID_RESPONSE");
  }
  if (
    typeof value.ok !== "boolean" ||
    value.requestId !== requestId ||
    value.action !== action ||
    !("data" in value) ||
    !("error" in value)
  ) {
    throw new TransfertsServiceError("TRANSFERTS_INVALID_RESPONSE");
  }
  if (
    value.error !== null &&
    (!isRecord(value.error) ||
      Object.keys(value.error).sort().join(",") !== "code,message" ||
      typeof value.error.code !== "string" ||
      typeof value.error.message !== "string")
  ) {
    throw new TransfertsServiceError("TRANSFERTS_INVALID_RESPONSE");
  }
  if (
    value.ok === true &&
    (action === "GET_TRANSFER"
      ? !isRecord(value.data)
      : !Array.isArray(value.data))
  ) {
    throw new TransfertsServiceError("TRANSFERTS_INVALID_RESPONSE");
  }
  return value as AppsScriptResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
