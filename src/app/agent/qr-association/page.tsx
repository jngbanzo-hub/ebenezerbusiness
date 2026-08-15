import type { Metadata } from "next";

import { QrAssociationPage } from "@/features/agent/qr-association-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Associer un QR",
  description: "Associer un QR à un colis certifié.",
  path: "/agent/qr-association",
  noIndex: true
});

export default function Page() {
  return <QrAssociationPage />;
}
