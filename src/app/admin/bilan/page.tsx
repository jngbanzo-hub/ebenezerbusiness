import type { Metadata } from "next";

import { AdminBilanPage } from "@/features/admin/bilan/admin-bilan-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Bilan — Administration", description: "Bilan administratif en lecture seule.", path: "/admin/bilan", noIndex: true });
export default function Page() { return <AdminBilanPage />; }
