import type { Metadata } from "next";

import { StockagesStatusPage } from "@/features/stockages/stockages-status-page";
import { AgentStockagesV2Page } from "@/features/stockages/stockages-v2-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Stockages — Espace Agent",
  description: "État préparatoire du système de gestion des stockages.",
  path: "/agent/stockages",
  noIndex: true
});

export default function AgentStockagesPage() {
  return process.env.STOCKAGES_V2_ENABLED === "true" ? (
    <AgentStockagesV2Page />
  ) : (
    <StockagesStatusPage scope="agent" backHref="/agent" />
  );
}
