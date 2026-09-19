import type { Metadata } from "next";

import { companyInfo } from "@/config/company";
import { PricingPage } from "@/features/pricing/pricing-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Tarifs",
  description:
    `Consultez les tarifs d'expédition ${companyInfo.name} vers les destinations en République Démocratique du Congo.`,
  path: "/tarifs"
});

export default function TarifsPage() {
  return <PricingPage />;
}
