import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminStatisticsPage } from "@/features/admin/admin-statistics-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Statistiques du manifeste — Administration", description: "Poids et volumes du manifeste en lecture seule.", path: "/admin/statistiques-manifeste", noIndex: true });
export default function Page() { return <Suspense><AdminStatisticsPage kind="manifest" /></Suspense>; }
