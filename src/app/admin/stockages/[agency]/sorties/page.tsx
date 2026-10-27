import type { Metadata } from "next";

import { AdminStorageExitsPage } from "@/features/stockages/admin-storage-exits-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Codes sortis — Stockages",
  description: "Historique des sorties physiques par agence en lecture seule.",
  path: "/admin/stockages",
  noIndex: true
});

export default function Page({ params }: { params: { agency: string } }) {
  return <AdminStorageExitsPage agency={params.agency} />;
}
