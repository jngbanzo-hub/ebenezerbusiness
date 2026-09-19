import type { Metadata } from "next";

import { AdminOperationalAnomalies } from "@/features/admin/admin-operational-anomalies";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Centre d’anomalies — Administration", description: "Contrôles opérationnels read-only.", path: "/admin/anomalies", noIndex: true });
export default function Page() { return <AdminOperationalAnomalies/>; }
