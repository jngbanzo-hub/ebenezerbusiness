import type { Metadata } from "next";

import { ReceptionStatisticsPage } from "@/features/agent/reception-statistics-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Statistiques de Réception", description: "Colis et poids prévus à la réception de votre agence.", path: "/agent/statistiques-reception", noIndex: true });
export default function Page() { return <ReceptionStatisticsPage />; }
