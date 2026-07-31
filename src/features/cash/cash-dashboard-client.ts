import type { AdminCashDashboard, CashDashboard } from "./cash-dashboard";

export async function loadAgentCash(token: string, fetcher: typeof fetch = fetch): Promise<{ businessDate: string; cash: CashDashboard | null; outsideCash: boolean }> {
  return request("/api/agent/cash", token, fetcher);
}
export async function loadAdminCash(token: string, fetcher: typeof fetch = fetch): Promise<AdminCashDashboard> {
  return request("/api/admin/cash", token, fetcher);
}

async function request<T>(url: string, token: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readMessage(payload));
  return payload as T;
}

function readMessage(value: unknown) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  }
  return "Lecture de la Caisse impossible.";
}
