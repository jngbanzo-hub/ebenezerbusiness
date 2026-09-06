import { authorizeAdminRequest } from "@/server/admin-authorization";
import { buildAdminBilan } from "@/features/admin/bilan/bilan-service";
import { createBilanGetHandler } from "@/features/admin/bilan/bilan-route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = createBilanGetHandler({ authorize: authorizeAdminRequest, build: buildAdminBilan });
