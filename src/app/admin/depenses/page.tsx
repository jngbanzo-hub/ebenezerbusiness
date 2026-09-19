import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/admin-workspace";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Dépenses — Administration", description: "Accès administratif au périmètre Dépenses existant.", path: "/admin/depenses", noIndex: true });

export default function AdminExpensesPage() { return <AdminWorkspace module="expenses" />; }
