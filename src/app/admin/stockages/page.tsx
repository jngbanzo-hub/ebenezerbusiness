import type { Metadata } from "next";

import { StockagesStatusPage } from "@/features/stockages/stockages-status-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Stockages — Administration",
  description: "Consultation administrative en lecture seule des stockages.",
  path: "/admin/stockages",
  noIndex: true
});

export default function AdminStockagesPage() {
  return <StockagesStatusPage scope="admin" backHref="/admin" />;
}
