import type { Metadata } from "next";

import { companyInfo } from "@/config/company";
import { SignInForm } from "@/features/agent/sign-in-form";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Connexion",
  description: `Accès sécurisé à l'espace professionnel ${companyInfo.name}.`,
  path: "/auth/sign-in",
  noIndex: true
});

export default function SignInPage() {
  return <SignInForm />;
}
