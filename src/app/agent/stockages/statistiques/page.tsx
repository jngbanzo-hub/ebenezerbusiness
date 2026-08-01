import type { Metadata } from "next";
import { AgentStockagesStatisticsPage } from "@/features/stockages/stockages-v2-page";
import { createPageMetadata } from "@/lib/seo";
export const metadata: Metadata = createPageMetadata({ title: "Statistiques Stockages", description: "Statistiques physiques du Stockage.", path: "/agent/stockages/statistiques", noIndex: true });
export default function Page() { return <AgentStockagesStatisticsPage />; }
