import type { Metadata } from "next";

import { AdminStorageAgencyDetailPage } from "@/features/stockages/admin-storage-agency-detail-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Détail Stockage — Administration",
  description: "Consultation administrative en lecture seule des colis présents en agence.",
  path: "/admin/stockages",
  noIndex: true
});

export default function Page({ params }: { params: { agency: string } }) {
  return <AdminStorageAgencyDetailPage agency={params.agency} />;
}
