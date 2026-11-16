import type { Metadata } from "next";

import { CashExpenseRecoveryPage } from "@/features/admin/cash-expense-recovery-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Reprise du débit Caisse — Administration",
  description: "Confirmation contrôlée du débit Caisse d'une dépense déjà enregistrée.",
  path: "/admin/depenses/reprise-caisse",
  noIndex: true
});

export default function Page() {
  if (process.env.KLZ_EXPENSE_CASH_RECOVERY_ENABLED?.trim().toLowerCase() !== "true") {
    return <main className="p-8">Cette reprise est désactivée.</main>;
  }
  return <CashExpenseRecoveryPage />;
}
