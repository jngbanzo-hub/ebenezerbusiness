import type { Metadata } from "next";

import { companyInfo } from "@/config/company";
import { LivePage } from "@/features/live/live-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Live",
  description:
    `Suivez les directs, annonces et communications officielles de ${companyInfo.name}.`,
  path: "/live"
});

export default function LiveRoutePage() {
  return <LivePage />;
}
