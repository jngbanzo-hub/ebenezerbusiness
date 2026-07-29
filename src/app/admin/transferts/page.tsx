import type { Metadata } from "next";

import { AdminTransfertsPage } from "@/features/transferts/admin-transferts-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Transferts — Administration",
  description: "Supervision administrative préparatoire des transferts.",
  path: "/admin/transferts",
  noIndex: true
});

export default function AdminTransfersRoutePage() {
  return <AdminTransfertsPage />;
}
