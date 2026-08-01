import type { Metadata } from "next";

import { AgentStockagesV2Page } from "@/features/stockages/stockages-v2-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Stockages — Espace Agent",
  description: "État préparatoire du système de gestion des stockages.",
  path: "/agent/stockages",
  noIndex: true
});

export default function AgentStockagesPage() {
  return <AgentStockagesV2Page />;
}
