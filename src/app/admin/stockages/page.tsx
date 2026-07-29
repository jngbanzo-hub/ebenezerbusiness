import type { Metadata } from "next";

import { AdminStockagesPage as AdminStockagesWorkspace } from "@/features/stockages/admin-stockages-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Stockages — Administration",
  description: "Consultation administrative en lecture seule des stockages.",
  path: "/admin/stockages",
  noIndex: true
});

export default function AdminStockagesPage() {
  return <AdminStockagesWorkspace />;
}
