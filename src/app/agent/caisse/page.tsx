import type { Metadata } from "next";

import { AgentCashPage } from "@/features/cash/cash-dashboard-view";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Caisse — Espace Agent",
  description: "Consultation sécurisée de la caisse commune de votre agence.",
  path: "/agent/caisse",
  noIndex: true
});

export default function AgentCashRoute() {
  return <AgentCashPage />;
}
