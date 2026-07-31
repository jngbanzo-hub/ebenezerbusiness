import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/admin-workspace";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Encaissements — Administration", description: "Consultation administrative des encaissements.", path: "/admin/encaissements", noIndex: true });

export default function AdminPaymentsPage() { return <AdminWorkspace module="payments" />; }
