import type { Metadata } from "next";

import { AgentWorkspace } from "@/features/agent/agent-workspace";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Caisse agent",
  description: "Espace sécurisé de gestion des paiements agents.",
  path: "/agent",
  noIndex: true
});

export default function AgentPage() {
  return <AgentWorkspace />;
}
