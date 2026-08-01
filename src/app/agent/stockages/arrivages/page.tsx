import type { Metadata } from "next";
import { AgentStockagesArrivalsPage } from "@/features/stockages/stockages-v2-page";
import { createPageMetadata } from "@/lib/seo";
export const metadata: Metadata = createPageMetadata({ title: "Arrivages Stockages", description: "Déclaration physique des arrivages.", path: "/agent/stockages/arrivages", noIndex: true });
export default function Page() { return <AgentStockagesArrivalsPage />; }
