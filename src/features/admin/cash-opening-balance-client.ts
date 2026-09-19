export type OpeningBalanceCommand = Readonly<{ agency: "FIH" | "LSHI" | "KLZ"; amount: number; businessDate: string; observation?: string; requestId: string; confirmationFinal: true }>;
export type OpeningBalanceSuccess = Readonly<{ state: "SUCCESS"; replayed: boolean; eventId: string; agency: OpeningBalanceCommand["agency"]; amount: number; currency: "USD"; businessDate: string; accountStatus: "ACTIVE" }>;

export class OpeningBalanceRequestError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); this.name = "OpeningBalanceRequestError"; }
}

export async function submitOpeningBalance(token: string, command: OpeningBalanceCommand, fetcher: typeof fetch = fetch): Promise<OpeningBalanceSuccess> {
  if (!token.trim()) throw new OpeningBalanceRequestError("UNAUTHORIZED", 401, "Votre session Admin a expiré.");
  const response = await fetcher("/api/admin/cash/opening-balance", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(command) });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok && isSuccess(payload)) return payload;
  const remote = readError(payload);
  throw new OpeningBalanceRequestError(remote.code, response.status, remote.message);
}

function isSuccess(value: unknown): value is OpeningBalanceSuccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.state === "SUCCESS" && typeof row.replayed === "boolean" && typeof row.eventId === "string" && ["FIH", "LSHI", "KLZ"].includes(String(row.agency)) && typeof row.amount === "number" && row.currency === "USD" && typeof row.businessDate === "string" && row.accountStatus === "ACTIVE";
}
function readError(value: unknown) {
  const error = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).error : null;
  const row = error && typeof error === "object" && !Array.isArray(error) ? error as Record<string, unknown> : {};
  return { code: typeof row.code === "string" ? row.code : "SERVICE_UNAVAILABLE", message: typeof row.message === "string" ? row.message : "Le service Caisse est indisponible." };
}
