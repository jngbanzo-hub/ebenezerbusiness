/** B1 preparation only. Copy this isolated route only after separate deployment approval. */
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { handleAdminTransferOidcProbeRequest } from "@/server/admin-transfer-oidc-probe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleAdminTransferOidcProbeRequest(request, {
    enabled: process.env.TRANSFERTS_ADMIN_OIDC_PROBE_ENABLED === "true",
    expiresAt: process.env.TRANSFERTS_ADMIN_OIDC_PROBE_EXPIRES_AT,
    vercelEnvironment: process.env.VERCEL_ENV,
    authorize: authorizeAdminRequest,
    config: {
        providerAudience: process.env.TRANSFERTS_READER_WIF_AUDIENCE ?? "",
        serviceAccountEmail: process.env.TRANSFERTS_READER_SERVICE_ACCOUNT ?? "",
        spreadsheetId: process.env.TRANSFERTS_READER_SPREADSHEET_ID ?? ""
    }
  });
}
