import type { Metadata } from "next";

import { AgentDashboard } from "@/features/agent/agent-dashboard";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Espace Agent",
  description: "Tableau de bord sécurisé des opérations Agent.",
  path: "/agent",
  noIndex: true
});

export default function AgentPage() {
  return <AgentDashboard />;
}
