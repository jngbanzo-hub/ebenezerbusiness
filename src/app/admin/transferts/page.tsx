import type { Metadata } from "next";

import { AdminTransfertsPage } from "@/features/transferts/admin-transferts-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Transferts — Administration",
  description: "Supervision administrative préparatoire des transferts.",
  path: "/admin/transferts",
  noIndex: true
});

export default function AdminTransfersRoutePage() {
  return <AdminTransfertsPage
    oidcProbeEnabled={process.env.VERCEL_ENV === "production" &&
      process.env.TRANSFERTS_ADMIN_OIDC_PROBE_ENABLED === "true"}
    oidcProbeExpiresAt={process.env.TRANSFERTS_ADMIN_OIDC_PROBE_EXPIRES_AT}
    deploymentAttestationEnabled={process.env.VERCEL_ENV === "production" &&
      process.env.TRANSFERTS_ADMIN_DEPLOYMENT_ATTESTATION_ENABLED === "true"}
    deploymentAttestationExpiresAt={process.env.TRANSFERTS_ADMIN_DEPLOYMENT_ATTESTATION_EXPIRES_AT}
  />;
}
