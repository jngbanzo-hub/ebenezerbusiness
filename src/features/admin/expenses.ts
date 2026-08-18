import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { authenticatedRead } from "@/features/auth/authenticated-fetch";

export type AdminExpenseAgency = "COO" | "FIH" | "LSHI" | "KLZ";
export type AdminExpenseCurrency = "USD" | "FCFA" | "CDF";
export type AdminExpenseStatus =
  | "ACTIVE"
  | "CORRECTION_DEMANDEE"
  | "CORRIGEE"
  | "ANNULEE";

export type ActiveExpenseAgent = Readonly<{
  id: string;
  name: string;
  agency: AdminExpenseAgency;
}>;

export type AdminExpense = Readonly<{
  id: string;
  expenseRequestId: string;
  date: string;
  dateHeure: string;
  agence: AdminExpenseAgency;
  categorie: string;
  montant: number;
  devise: AdminExpenseCurrency;
  description: string;
  observation: string;
  agent: string;
  statut: AdminExpenseStatus;
  reference: string;
  dateCreation: string;
  dateMiseAJour: string;
  annulee: boolean;
  corrigee: boolean;
}>;

export type AdminExpenseFilters = Readonly<{
  from?: string;
  to?: string;
  agency?: AdminExpenseAgency;
  category?: string;
  currency?: AdminExpenseCurrency;
  agent?: string;
  status?: AdminExpenseStatus;
  reference?: string;
  page: number;
  pageSize: number;
}>;

export type AdminExpensesResponse = Readonly<{
  success: true;
  code: "DEPENSES_ADMIN_LISTEES";
  lectureSeule: true;
  depenses: AdminExpense[];
  pagination: Readonly<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>;
  totaux: Readonly<{
    nombreDepenses: number;
    parDevise: Record<string, number>;
    parAgence: Record<string, Record<string, number>>;
    parCategorie: Record<string, Record<string, number>>;
  }>;
}>;

export class AdminExpensesApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AdminExpensesApiError";
  }
}

export async function loadActiveExpenseAgents(
  token: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<ActiveExpenseAgent[]> {
  const url = "/api/admin/expenses/agents";
  const response = fetcher === fetch
    ? await authenticatedRead(getSupabaseBrowserClient().auth, url, { signal }, fetcher, token)
    : await fetcher(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal
      });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminExpensesApiError(
      readErrorMessage(payload) ?? "Impossible de charger les Agents.",
      response.status
    );
  }
  if (!isActiveExpenseAgentsResponse(payload)) {
    throw new AdminExpensesApiError("Réponse Agents invalide.", 503);
  }
  return payload.agents;
}

export function projectExpenseTotals(response: AdminExpensesResponse | null) {
  const currencies: AdminExpenseCurrency[] = ["USD", "FCFA", "CDF"];
  return Object.fromEntries(currencies.map((currency) => {
    const general = response?.totaux.parDevise[currency] ?? 0;
    const excluded = response?.totaux.parCategorie["TF Bénin"]?.[currency] ?? 0;
    return [currency, { general, withoutTfBenin: Math.max(0, general - excluded) }];
  })) as Record<AdminExpenseCurrency, Readonly<{ general: number; withoutTfBenin: number }>>;
}

export async function loadAdminExpenses(
  token: string,
  filters: AdminExpenseFilters,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<AdminExpensesResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const url = `/api/admin/expenses?${query.toString()}`;
  const response = fetcher === fetch
    ? await authenticatedRead(getSupabaseBrowserClient().auth, url, { signal }, fetcher, token)
    : await fetcher(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal
      });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readErrorMessage(payload) ?? "Impossible de charger les dépenses.";
    throw new AdminExpensesApiError(message, response.status);
  }
  if (!isAdminExpensesResponse(payload)) {
    throw new AdminExpensesApiError("Réponse Dépenses invalide.", 503);
  }
  return payload;
}

function readErrorMessage(value: unknown) {
  if (!value || typeof value !== "object" || !("error" in value)) return null;
  const error = value.error;
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  return typeof error.message === "string" ? error.message : null;
}

function isAdminExpensesResponse(value: unknown): value is AdminExpensesResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<AdminExpensesResponse>;
  return response.success === true && response.lectureSeule === true &&
    Array.isArray(response.depenses) && !!response.pagination && !!response.totaux;
}

function isActiveExpenseAgentsResponse(value: unknown): value is Readonly<{
  success: true;
  readOnly: true;
  agents: ActiveExpenseAgent[];
}> {
  if (!value || typeof value !== "object") return false;
  const response = value as { success?: unknown; readOnly?: unknown; agents?: unknown };
  return response.success === true && response.readOnly === true &&
    Array.isArray(response.agents) && response.agents.every((agent) => {
      if (!agent || typeof agent !== "object") return false;
      const row = agent as Partial<ActiveExpenseAgent>;
      return typeof row.id === "string" && typeof row.name === "string" &&
        ["COO", "FIH", "LSHI", "KLZ"].includes(row.agency ?? "");
    });
}
