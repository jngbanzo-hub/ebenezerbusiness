import "server-only";

import { businessDatePortoNovo, readAdminStorage } from "@/server/stockages-v2";
import { createServerCashDashboardSource } from "@/server/cash-dashboard-source";

export async function readAdminSystemStatus() {
  const [cash, storage] = await Promise.all([
    createServerCashDashboardSource().readAdmin(businessDatePortoNovo()),
    readAdminStorage()
  ]);
  const storageAccounts = Array.isArray(storage.accounts) ? storage.accounts : [];
  return {
    generatedAt: new Date().toISOString(),
    agencies: [
      { agency: "COO", cash: { status: "NOT_APPLICABLE" }, storage: { status: "NOT_APPLICABLE" }, payments: "OPERATIONAL", expenses: "OPERATIONAL", manifest: "READ_ONLY_OPERATIONAL" },
      ...(["FIH", "LSHI", "KLZ"] as const).map((agency) => {
        const cashAccount = cash.agencies.find((item) => item.agency === agency);
        const storageAccount = storageAccounts.find((item: Record<string, unknown>) => item.agency === agency) as Record<string, unknown> | undefined;
        return { agency, cash: { status: cashAccount?.accountStatus ?? "UNKNOWN", currentBalance: cashAccount?.currentBalance ?? null, currency: "USD" }, storage: { status: String(storageAccount?.status ?? "UNKNOWN"), parcelCount: Number(storageAccount?.current_parcel_count ?? 0), weightKg: Number(storageAccount?.current_weight_kg ?? 0) }, payments: "OPERATIONAL", expenses: "OPERATIONAL", manifest: "READ_ONLY_OPERATIONAL" };
      })
    ]
  };
}
