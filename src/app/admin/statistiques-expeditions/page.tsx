import type { Metadata } from "next";

import { AdminStatisticsPage } from "@/features/admin/admin-statistics-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Statistiques des expéditions — Administration", description: "Expéditions et groupages en lecture seule.", path: "/admin/statistiques-expeditions", noIndex: true });
export default function Page() { return <AdminStatisticsPage kind="shipments" />; }
