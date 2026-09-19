import type { Metadata } from "next";

import { companyInfo } from "@/config/company";
import { ContactPage } from "@/features/contact/contact-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Contact",
  description: `Contacts officiels, agences et formulaire de demande pour ${companyInfo.name}.`,
  path: "/contact"
});

export default function ContactRoutePage() {
  return <ContactPage />;
}
