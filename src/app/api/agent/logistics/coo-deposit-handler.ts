import type { AgentAuthorizationResult } from "@/server/agent-authorization";

import {
  CooDepositCommandService,
  CooDepositError,
} from "./coo-deposit-command";

type Authorize = (request: Request) => Promise<AgentAuthorizationResult>;

export function createCooDepositPostHandler(
  authorize: Authorize,
  serviceOrFactory: CooDepositCommandService | (() => CooDepositCommandService),
) {
  return async function POST(request: Request): Promise<Response> {
    const authorization = await authorize(request);
    if (!authorization.authorized) {
      return error(
        authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit.",
        authorization.status,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error("INVALID_COMMAND", "Corps JSON invalide.", 400);
    }

    const service =
      typeof serviceOrFactory === "function" ? serviceOrFactory() : serviceOrFactory;

    try {
      const result = await service.execute(body, {
        userId: authorization.identity.userId,
        site: authorization.identity.site,
      });
      return Response.json(result, {
        status: result.replayed ? 200 : 201,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      });
    } catch (caught) {
      if (!(caught instanceof CooDepositError)) {
        return error("SERVICE_UNAVAILABLE", "Service logistique indisponible.", 503);
      }
      const status = {
        INVALID_COMMAND: 400,
        FORBIDDEN: 403,
        PARCEL_NOT_FOUND: 404,
        PARCEL_ALREADY_INITIALIZED: 409,
        IDEMPOTENCY_CONFLICT: 409,
        SERVICE_UNAVAILABLE: 503,
      }[caught.code];
      return error(caught.code, caught.message, status);
    }
  };
}

function error(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
