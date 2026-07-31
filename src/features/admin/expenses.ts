export type AdminExpenseAgency = "COO" | "FIH" | "LSHI" | "KLZ";
export type AdminExpenseCurrency = "USD" | "FCFA" | "CDF";
export type AdminExpenseStatus =
  | "ACTIVE"
  | "CORRECTION_DEMANDEE"
  | "CORRIGEE"
  | "ANNULEE";

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
  const response = await fetcher(`/api/admin/expenses?${query.toString()}`, {
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
