import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/admin-workspace";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Statistiques du site public — Administration",
  description: "Statistiques agrégées et anonymes du site public.",
  path: "/admin/statistiques-site-public",
  noIndex: true
});

export default function Page() {
  return <AdminWorkspace module="public-site-analytics" />;
}
