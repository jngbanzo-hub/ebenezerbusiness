import type { Metadata } from "next";

import { AdminParcelHistoryView } from "@/features/admin/admin-parcel-history";

export const metadata: Metadata = { title: "Historique colis — Administration", robots: { index: false, follow: false } };
export default function Page({ params }: { params: { code: string } }) { return <AdminParcelHistoryView code={decodeURIComponent(params.code).trim().toUpperCase()}/>; }
