import type { Metadata } from "next";
import { AgentStockagesOutputsPage } from "@/features/stockages/stockages-v2-page";
import { createPageMetadata } from "@/lib/seo";
export const metadata: Metadata = createPageMetadata({ title: "Sorties Stockages", description: "Historique physique des sorties.", path: "/agent/stockages/sorties", noIndex: true });
export default function Page() { return <AgentStockagesOutputsPage />; }
