import type { Metadata } from "next";

import { companyInfo } from "@/config/company";
import { ServicesPage } from "@/features/services/services-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Services",
  description:
    `Découvrez les services logistiques ${companyInfo.name} pour vos colis entre le Bénin et la République Démocratique du Congo.`,
  path: "/services"
});

export default function ServicesRoutePage() {
  return <ServicesPage />;
}
