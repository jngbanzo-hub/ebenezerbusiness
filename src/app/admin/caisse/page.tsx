import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/admin-workspace";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({ title: "Caisse — Administration", description: "Supervision administrative des caisses FIH, LSHI et KLZ.", path: "/admin/caisse", noIndex: true });

export default function AdminCashPage() { return <AdminWorkspace module="cash" />; }
