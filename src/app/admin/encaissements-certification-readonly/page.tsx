import type { Metadata } from "next";

import { EncaissementsCertificationReadonlyPage } from "@/features/admin/encaissements-certification-readonly-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Certification encaissements — Administration",
  description: "Certification temporaire read-only des sources historiques.",
  path: "/admin/encaissements-certification-readonly",
  noIndex: true
});

export default function Page() {
  return <EncaissementsCertificationReadonlyPage />;
}
