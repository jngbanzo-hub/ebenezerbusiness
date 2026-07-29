import type {
  AdminStockagesAuditResponse,
  AdminStockagesMovementsResponse,
  AdminStockagesStatusResponse
} from "@/features/stockages/admin-stockages-types";

export class AdminStockagesApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function loadAdminStockagesStatus(token: string, signal?: AbortSignal) {
  return loadAdminStockages<AdminStockagesStatusResponse>(
    "/api/admin/stockages/status",
    token,
    signal
  );
}

export function loadAdminStockagesMovements(
  token: string,
  filters: Record<string, string>,
  signal?: AbortSignal
) {
  return loadAdminStockages<AdminStockagesMovementsResponse>(
    withFilters("/api/admin/stockages/movements", filters),
    token,
    signal
  );
}

export function loadAdminStockagesAudit(
  token: string,
  filters: Record<string, string>,
  signal?: AbortSignal
) {
  return loadAdminStockages<AdminStockagesAuditResponse>(
    withFilters("/api/admin/stockages/audit", filters),
    token,
    signal
  );
}

async function loadAdminStockages<T>(
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
        : "Le module Stockages est temporairement indisponible.";
    throw new AdminStockagesApiError(message, response.status);
  }
  return payload as T;
}

function withFilters(path: string, filters: Record<string, string>) {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
