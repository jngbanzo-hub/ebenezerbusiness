import type { AdminAuthorizationResult } from "@/server/admin-authorization";

import { OpeningBalanceCommandService, OpeningBalanceError } from "./opening-balance-command";

type Authorize = (request: Request) => Promise<AdminAuthorizationResult>;

export function createOpeningBalancePostHandler(authorize: Authorize, serviceOrFactory: OpeningBalanceCommandService | (() => OpeningBalanceCommandService)) {
  return async function POST(request: Request): Promise<Response> {
    const authorization = await authorize(request);
    if (!authorization.authorized) return responseError(authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", authorization.status === 401 ? "Session invalide ou expirée." : "Accès Admin interdit.", authorization.status);
    let body: unknown;
    try { body = await request.json(); } catch { return responseError("INVALID_COMMAND", "Corps JSON invalide.", 400); }
    try {
      const service = typeof serviceOrFactory === "function" ? serviceOrFactory() : serviceOrFactory;
      const result = await service.execute(body, { userId: authorization.userId, name: authorization.email, role: "ADMIN" });
      return Response.json(result, { status: result.replayed ? 200 : 201, headers: noStore });
    } catch (error) {
      if (!(error instanceof OpeningBalanceError)) return responseError("SERVICE_UNAVAILABLE", "Service Caisse indisponible.", 503);
      const status = { INVALID_COMMAND: 400, ACCOUNT_NOT_READY: 409, OPENING_BALANCE_ALREADY_DEFINED: 409, SECOND_OPENING_NOT_ALLOWED: 409, IDEMPOTENCY_CONFLICT: 409, SERVICE_UNAVAILABLE: 503 }[error.code];
      return responseError(error.code, error.message, status);
    }
  };
}

const noStore = { "Cache-Control": "private, no-store, max-age=0" };
function responseError(code: string, message: string, status: number) { return Response.json({ error: { code, message } }, { status, headers: noStore }); }
