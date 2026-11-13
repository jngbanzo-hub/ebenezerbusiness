/** Paquet temporaire non publié. Aucune fonction métier Transferts n'est appelée. */
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { attestAdminTransferDeployment } from "@/server/admin-transfer-deployment-attestation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return attestAdminTransferDeployment(request, {
    enabled: process.env.TRANSFERTS_ADMIN_DEPLOYMENT_ATTESTATION_ENABLED === "true",
    expiresAt: process.env.TRANSFERTS_ADMIN_DEPLOYMENT_ATTESTATION_EXPIRES_AT,
    vercelEnvironment: process.env.VERCEL_ENV,
    configuredUrl: process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL,
    authorize: authorizeAdminRequest
  });
}
