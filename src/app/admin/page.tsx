import type { Metadata } from "next";

import { AdminWorkspace } from "@/features/admin/admin-workspace";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Espace Administrateur",
  description: "Espace sécurisé réservé aux administrateurs.",
  path: "/admin",
  noIndex: true
});

export default function AdminPage() {
  return <AdminWorkspace />;
}
