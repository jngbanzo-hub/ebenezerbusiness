import type { Metadata } from "next";

import { AgentTransfertsPage } from "@/features/transferts/agent-transferts-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Transferts — Espace Agent",
  description: "Module sécurisé de consultation des transferts.",
  path: "/agent/transferts",
  noIndex: true
});

export default function AgentTransfersRoutePage() {
  return <AgentTransfertsPage />;
}
