import type { StockagesPreparationStatus } from "@/features/stockages/types";

export class StockagesStatusApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function loadStockagesStatus(
  accessToken: string,
  scope: "agent" | "admin",
  signal?: AbortSignal
) {
  const response = await fetch(`/api/${scope}/stockages/status`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store",
    signal
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Le statut Stockages est temporairement indisponible.";
    throw new StockagesStatusApiError(message, response.status);
  }

  if (!isStockagesPreparationStatus(payload)) {
    throw new StockagesStatusApiError(
      "Réponse Stockages invalide.",
      502
    );
  }

  return payload;
}

function isStockagesPreparationStatus(
  value: unknown
): value is StockagesPreparationStatus {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.mode === "PREPARATION" &&
    value.realSyncEnabled === false &&
    Array.isArray(value.initialBalances) &&
    isRecord(value.snapshot) &&
    isRecord(value.anomalies)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
