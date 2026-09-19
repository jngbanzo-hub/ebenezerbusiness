import type { Metadata } from "next";

import { AdminQrReprint } from "@/features/admin/admin-qr-reprint";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Réimprimer une étiquette QR", description: "Aperçu Admin en lecture seule d’une étiquette QR existante.", path: "/admin/qr-associations/reimpression", noIndex: true });

export default function AdminQrReprintPage({ params }: { params: { selector: string } }) {
  return <AdminQrReprint selector={decodeURIComponent(params.selector)} />;
}
