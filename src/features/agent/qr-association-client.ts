import type { BrowserAuth } from "@/features/auth/authenticated-fetch";
import {
  authenticatedRead,
  AuthenticatedRequestError
} from "@/features/auth/authenticated-fetch";

export type QrAgency = "FIH" | "LSHI" | "KLZ";

export type QrCandidate = {
  qrId: string;
  displayNumber: number;
  status: "UNASSIGNED" | "ASSIGNED" | "REVOKED";
  version: number;
  agency?: QrAgency;
  trackingCode?: string;
};

export type QrAssignmentPayload = {
  displayNumber: number;
  agency: QrAgency;
  trackingCode: string;
  expectedVersion: number;
  requestId: string;
};

export type QrAssignmentSuccess = {
  qrId: string;
  displayNumber: number;
  status: "ASSIGNED";
  agency: QrAgency;
  trackingCode: string;
  version: number;
  replayed: boolean;
};

type Fetcher = typeof fetch;

export async function resolveQrCandidate(
  auth: BrowserAuth,
  displayNumber: number,
  fetcher: Fetcher = fetch
): Promise<QrCandidate> {
  const response = await authenticatedRead(
    auth,
    `/api/agent/qr/resolve?displayNumber=${displayNumber}`,
    {},
    fetcher
  );
  return readResponse<QrCandidate>(response);
}

export async function resolveQrById(
  auth: BrowserAuth,
  qrId: string,
  fetcher: Fetcher = fetch
): Promise<QrCandidate> {
  const match = /^EEBQR([0-9]{6,})$/.exec(qrId.trim().toUpperCase());
  const displayNumber = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(displayNumber) || displayNumber <= 0) {
    throw new AuthenticatedRequestError("QR inconnu/non reconnu.", 400, "INVALID_QR_ID");
  }
  return resolveQrCandidate(auth, displayNumber, fetcher);
}

export async function submitQrAssociation(
  auth: BrowserAuth,
  payload: QrAssignmentPayload,
  fetcher: Fetcher = fetch
): Promise<QrAssignmentSuccess> {
  const response = await authenticatedRead(
    auth,
    "/api/agent/qr/assign",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    fetcher
  );
  return readResponse<QrAssignmentSuccess>(response);
}

export function createQrAssignmentRequestId(randomUuid = crypto.randomUUID) {
  return randomUuid.call(crypto);
}

async function readResponse<T>(response: Response): Promise<T> {
  const raw: unknown = await response.json().catch(() => null);
  if (response.ok && raw && typeof raw === "object") return raw as T;
  const payload = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const code = typeof payload?.code === "string" ? payload.code : "REQUEST_FAILED";
  throw new AuthenticatedRequestError(messageForQrError(code), response.status, code);
}

export function messageForQrError(code: string) {
  const messages: Record<string, string> = {
    ACCESS_DENIED: "Votre session a expiré ou votre compte n’est pas autorisé.",
    INVALID_QR_DISPLAY_NUMBER: "Le numéro QR est invalide.",
    INVALID_QR_COMMAND: "Les informations d’association sont invalides.",
    QR_NOT_FOUND: "QR inconnu/non reconnu.",
    QR_NOT_UNASSIGNED: "Ce QR est déjà associé ou révoqué.",
    QR_AGENCY_ACCESS_DENIED: "Vous ne pouvez pas associer un QR pour cette agence.",
    IDENTITY_NOT_FOUND: "Ce code colis est introuvable dans le MANIFESTE officiel.",
    QR_VERSION_CONFLICT: "L’état du QR a changé. Relancez la prévalidation.",
    QR_IDEMPOTENCY_CONFLICT: "Cette demande est en conflit avec une opération précédente.",
    QR_PARCEL_ALREADY_ASSIGNED: "Ce colis est déjà associé à un autre QR.",
    IDENTITY_SERVICE_UNAVAILABLE: "La source métier est temporairement indisponible.",
    QR_SERVICE_UNAVAILABLE: "Le service QR est temporairement indisponible."
  };
  return messages[code] ?? "L’opération QR n’a pas pu être effectuée.";
}
