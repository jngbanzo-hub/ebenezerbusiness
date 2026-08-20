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

export type QrBatchPrevalidationLine = {
  lineNumber: number;
  displayNumber: string;
  qrId?: string;
  agency: string;
  trackingCode: string;
  qrStatus?: "UNASSIGNED" | "ASSIGNED" | "REVOKED";
  version?: number;
  currentAgency?: QrAgency;
  currentTrackingCode?: string;
  manifestCertified: boolean;
  duplicate: boolean;
  ready: boolean;
  result: string;
};

export type QrBatchAssignmentLineResult = {
  lineNumber: number;
  requestId: string;
  state: "ASSOCIATED" | "ALREADY_ASSOCIATED" | "ERROR";
  code?: string;
  replayed?: boolean;
};

export type ManifestQrCandidate = {
  agency: QrAgency;
  rowNumber: number;
  date: string;
  trackingCode: string;
  qrNumber: string;
  displayNumber: string;
  qrId?: string;
  qrStatus?: "UNASSIGNED" | "ASSIGNED" | "REVOKED";
  version?: number;
  currentAgency?: QrAgency;
  currentTrackingCode?: string;
  ready: boolean;
  result: string;
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

export async function submitQrBatchAssociation(
  auth: BrowserAuth,
  lines: Array<QrAssignmentPayload & { lineNumber: number }>,
  fetcher: Fetcher = fetch
): Promise<QrBatchAssignmentLineResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await authenticatedRead(
      auth,
      "/api/agent/qr/batch-assign",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
        signal: controller.signal
      },
      fetcher
    );
    return (await readResponse<{ lines: QrBatchAssignmentLineResult[] }>(response)).lines;
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new AuthenticatedRequestError(
        "La confirmation a dépassé le délai prévu. Vérifiez l’état réel avant de réessayer.",
        503,
        "BATCH_ASSIGNMENT_TIMEOUT"
      );
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

export async function prevalidateQrBatch(
  auth: BrowserAuth,
  lines: Array<{
    lineNumber: number;
    displayNumber: string;
    agency: string;
    trackingCode: string;
  }>,
  fetcher: Fetcher = fetch
): Promise<QrBatchPrevalidationLine[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await authenticatedRead(
      auth,
      "/api/agent/qr/batch-prevalidate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
        signal: controller.signal
      },
      fetcher
    );
    const payload = await readResponse<{ lines: QrBatchPrevalidationLine[] }>(response);
    return payload.lines;
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new AuthenticatedRequestError(
        "Prévalidation temporairement indisponible. Veuillez réessayer.",
        503,
        "BATCH_PREVALIDATION_TIMEOUT"
      );
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadManifestQrCandidates(
  auth: BrowserAuth,
  fetcher: Fetcher = fetch
): Promise<{ candidates: ManifestQrCandidate[]; readyCount: number }> {
  const response = await authenticatedRead(
    auth,
    "/api/agent/qr/manifest-candidates",
    {},
    fetcher
  );
  return readResponse<{ candidates: ManifestQrCandidate[]; readyCount: number }>(response);
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
