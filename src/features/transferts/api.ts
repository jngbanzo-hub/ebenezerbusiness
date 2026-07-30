import type {
  CreateTransferInput,
  CorrectTransferCodeInput,
  TransferDetailResponse,
  TransferWriteResponse,
  TransfersAuditResponse,
  TransfersPageResponse
} from "@/features/transferts/types";

export class TransfertsApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function loadAgentTransfers(token: string, signal?: AbortSignal) {
  return loadTransfers<TransfersPageResponse>(
    "/api/agent/transferts",
    token,
    signal
  );
}

export function createAgentTransfer(token: string, input: CreateTransferInput) {
  return writeTransfer("/api/agent/transferts", token, input);
}

export function loadAgentTransferDetail(
  token: string,
  transferId: string,
  signal?: AbortSignal
) {
  return loadTransfers<TransferDetailResponse>(
    `/api/agent/transferts/${encodeURIComponent(transferId)}`,
    token,
    signal
  );
}

export function loadAdminTransferDetail(
  token: string,
  transferId: string,
  signal?: AbortSignal
) {
  return loadTransfers<TransferDetailResponse>(
    `/api/admin/transferts/${encodeURIComponent(transferId)}`,
    token,
    signal
  );
}

export function correctAdminTransferCode(
  token: string,
  transferId: string,
  input: CorrectTransferCodeInput
) {
  return writeTransfer(
    `/api/admin/transferts/${encodeURIComponent(transferId)}/correct-code`,
    token,
    input
  );
}

export function performAgentTransferAction(
  token: string,
  transferId: string,
  action: "confirm-code" | "confirm-withdrawal" | "confirm-transfer" | "flag-review" | "cancel",
  body: Record<string, unknown> = {}
) {
  return writeTransfer(
    `/api/agent/transferts/${encodeURIComponent(transferId)}/${action}`,
    token,
    body
  );
}

export function loadAdminTransfers(
  token: string,
  filters: Record<string, string>,
  signal?: AbortSignal
) {
  return loadTransfers<TransfersPageResponse>(
    withFilters("/api/admin/transferts", filters),
    token,
    signal
  );
}

export function loadAdminTransfersAudit(
  token: string,
  filters: Record<string, string>,
  signal?: AbortSignal
) {
  return loadTransfers<TransfersAuditResponse>(
    withFilters("/api/admin/transferts/audit", filters),
    token,
    signal
  );
}

async function loadTransfers<T>(
  url: string,
  token: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Le module Transferts est temporairement indisponible.";
    throw new TransfertsApiError(message, response.status);
  }
  return payload as T;
}

async function writeTransfer(
  url: string,
  token: string,
  body: unknown
): Promise<TransferWriteResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Le service Transferts est temporairement indisponible.";
    throw new TransfertsApiError(message, response.status);
  }
  return payload as TransferWriteResponse;
}

function withFilters(path: string, filters: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) search.set(key, value);
  }
  return search.size ? `${path}?${search.toString()}` : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
