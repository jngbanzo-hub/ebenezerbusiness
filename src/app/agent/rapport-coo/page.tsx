import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { CooReportPage } from "@/features/agent/coo-report-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Rapport COO",
  description: "Encaissements et dépenses COO en lecture seule.",
  path: "/agent/rapport-coo",
  noIndex: true
});

export default function Page() {
  return <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12"><Container><Button asChild variant="outline" size="sm"><Link href="/agent">Retour au tableau de bord</Link></Button><CooReportPage /></Container></main>;
}
