import type { Metadata } from "next";

import { companyInfo } from "@/config/company";
import { HomePage } from "@/features/home/home-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: `${companyInfo.name} - Fret Bénin RDC`,
  description:
    `${companyInfo.name} est votre partenaire de confiance pour le transport de colis entre le Bénin et la République Démocratique du Congo.`,
  path: "/",
  absoluteTitle: true
});

export default function Page() {
  return <HomePage />;
}
