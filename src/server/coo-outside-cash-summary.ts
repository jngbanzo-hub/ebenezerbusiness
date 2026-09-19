import "server-only";

import { buildCooOutsideCashSummary } from "@/features/cash/coo-outside-cash-summary";
import { readAdminExpenses } from "@/server/agent-expenses-apps-script";
import { readAdminPayments } from "@/server/admin-payments-sheets";

type AdminIdentity = Readonly<{
  userId: string;
  email: string;
  agency: "COO" | "FIH" | "LSHI" | "KLZ" | null;
}>;

export async function readCooOutsideCashSummary(
  businessDate: string,
  identity: AdminIdentity
){
  const [payments, expenses] = await Promise.all([
    readAdminPayments(),
    readAdminExpenses(identity, {
      dateDebut: businessDate,
      dateFin: businessDate,
      agence: "COO",
      page: 1,
      pageSize: 100
    })
  ]);
  return buildCooOutsideCashSummary(businessDate, payments, expenses.depenses);
}
