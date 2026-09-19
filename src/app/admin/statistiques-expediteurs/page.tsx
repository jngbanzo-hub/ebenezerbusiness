import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/admin-workspace";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Statistiques par expéditeur — Administration", description: "Statistiques administratives en lecture seule issues de MANIFESTE PUBLIC.", path: "/admin/statistiques-expediteurs", noIndex: true });

export default function AdminShipperStatisticsPage() { return <AdminWorkspace module="shippers" />; }
