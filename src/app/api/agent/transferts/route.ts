import type { TransferSummary, TransfersPageResponse } from "@/features/transferts/types";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import {
  callTransfertsReadApi,
  callTransfertsWriteApi,
  TransfertsConfigurationError
} from "@/server/transferts-apps-script";
import { mapAgentTransferError, error, privateJson, readJson } from "@/server/transferts-agent-actions";
import { areTransfertsWritesEnabled, getTransfertsFeatureFlags } from "@/server/transferts-feature-flags";
import { validateCreateTransferInput } from "@/server/transferts-write-validation";
import { notifyTransferCreated } from "@/server/transferts-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAgentRequest(request);
    if (!authorization.authorized) {
      return errorResponse(
        authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit.",
        authorization.status,
        "FORBIDDEN"
      );
    }
    const identity = authorization.identity;
    const data = await callTransfertsReadApi(
      "LIST_AGENCY_TRANSFERS",
      {
        userId: identity.userId,
        email: identity.email,
        role: identity.role,
        agency: identity.site
      },
      { agency: identity.site }
    );
    const transfers = Array.isArray(data) ? (data as TransferSummary[]) : [];
    const flags = getTransfertsFeatureFlags();
    const body: TransfersPageResponse = {
      state: transfers.length ? "READY" : "EMPTY",
      moduleStatus: "PREPARATION",
      role: "AGENT",
      agency: identity.site,
      apiAvailable: true,
      writesEnabled: flags.writesEnabled,
      adminEnabled: false,
      transfers,
      message: transfers.length
        ? "Transferts liés à votre agence."
        : "Aucun transfert n’est disponible pour votre agence."
    };
    return privateJson(body);
  } catch (error) {
    return error instanceof TransfertsConfigurationError
      ? errorResponse("Le module Transferts n’est pas configuré.", 503, "NOT_CONFIGURED")
      : errorResponse("Le service Transferts est temporairement indisponible.", 503, "SERVICE_UNAVAILABLE");
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeAgentRequest(request);
    if (!authorization.authorized) {
      return error(
        authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit.",
        authorization.status,
        authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN"
      );
    }
    if (!areTransfertsWritesEnabled()) {
      return error("Les opérations de transfert ne sont pas encore activées.", 503, "WRITES_DISABLED");
    }
    const identity = authorization.identity;
    const input = validateCreateTransferInput(await readJson(request), identity.site);
    const actor = {
      userId: identity.userId,
      email: identity.email,
      role: identity.role,
      agency: identity.site
    } as const;
    let transfer: unknown;
    try {
      transfer = await callTransfertsWriteApi(
        "CREATE_TRANSFER",
        actor,
        { ...input, agentFrom: identity.email }
      );
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) throw caught;
      const transfers = await callTransfertsReadApi(
        "LIST_AGENCY_TRANSFERS",
        actor,
        { agency: identity.site }
      );
      transfer = Array.isArray(transfers)
        ? transfers.find((item) =>
            item && typeof item === "object" &&
            (item as Record<string, unknown>).transferRequestId === input.transferRequestId
          )
        : undefined;
      if (!transfer) {
        return error(
          "Le résultat de cette opération doit être vérifié avant une nouvelle tentative.",
          503,
          "RESULT_REQUIRES_VERIFICATION"
        );
      }
    }
    await notifyTransferCreated(transfer, { userId: identity.userId, name: identity.nom }).catch(() => undefined);
    return privateJson({ state: "SUCCESS", message: "Transfert créé.", transfer }, 201);
  } catch (caught) {
    return mapAgentTransferError(caught);
  }
}

function errorResponse(message: string, status: number, state: string) {
  return privateJson({ state, message }, status);
}
