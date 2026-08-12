import type {
  AdminStockagesAuditResponse,
  AdminStockagesMovementsResponse,
  AdminStockagesStatusResponse
} from "@/features/stockages/admin-stockages-types";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

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
  const response = await authenticatedRead(getSupabaseBrowserClient().auth, url, { signal }, fetch, token);
  try {
    return await readJsonOrThrow<T>(response, "Le module Stockages est temporairement indisponible.");
  } catch (error) {
    if (error instanceof Error && "status" in error && typeof error.status === "number") {
      throw new AdminStockagesApiError(error.message, error.status);
    }
    throw error;
  }
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
