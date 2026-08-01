import type { Metadata } from "next";

import { AdminStockagesV2Page } from "@/features/stockages/stockages-v2-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Stockages — Administration",
  description: "Consultation administrative en lecture seule des stockages.",
  path: "/admin/stockages",
  noIndex: true
});

export default function AdminStockagesPage() {
  return <AdminStockagesV2Page />;
}
