import { authorizeAdminRequest } from "@/server/admin-authorization";
import { createServerOpeningBalanceRepository } from "@/server/cash-supabase-service";

import { OpeningBalanceCommandService } from "./opening-balance-command";
import { createOpeningBalancePostHandler } from "./opening-balance-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const enabledHandler = createOpeningBalancePostHandler(authorizeAdminRequest, () => new OpeningBalanceCommandService(createServerOpeningBalanceRepository()));

export async function POST(request: Request) {
  if (process.env.CASH_OPENING_BALANCE_ENABLED?.trim().toLowerCase() !== "true") {
    return Response.json({ error: { code: "WRITES_DISABLED", message: "La saisie des soldes initiaux n’est pas activée." } }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
  return enabledHandler(request);
}
