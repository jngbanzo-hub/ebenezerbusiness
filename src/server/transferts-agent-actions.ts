import "server-only";

import { NextResponse } from "next/server";

import type { TransferSummary } from "@/features/transferts/types";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import {
  callTransfertsReadApi,
  callTransfertsWriteApi,
  TransfertsConfigurationError,
  TransfertsServiceError,
  type TransfertsWriteAction
} from "@/server/transferts-apps-script";
import { areTransfertsWritesEnabled } from "@/server/transferts-feature-flags";
import {
  assertAgentMayPerformTransferAction,
  TransferActionError,
  TransferValidationError,
  validateTransferId,
  validateTransitionBody
} from "@/server/transferts-write-validation";

export async function executeAgentTransferAction(
  request: Request,
  rawTransferId: string,
  action: Exclude<TransfertsWriteAction, "CREATE_TRANSFER">,
  withMotif = false
) {
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
    const transferId = validateTransferId(rawTransferId);
    const input = validateTransitionBody(await readJson(request), withMotif);
    const actor = {
      userId: identity.userId,
      email: identity.email,
      role: identity.role,
      agency: identity.site
    } as const;
    const transfer = await callTransfertsReadApi("GET_TRANSFER", actor, { transferId }) as TransferSummary;
    assertAgentMayPerformTransferAction(action, transfer, identity.site);
    let result: unknown;
    try {
      result = await callTransfertsWriteApi(action, actor, {
        transferId,
        agency: identity.site,
        ...input
      });
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) throw caught;
      const recovered = await recoverTimedOutTransition(action, actor, transferId);
      if (!recovered) {
        return error(
          "Le résultat de cette opération doit être vérifié avant une nouvelle tentative.",
          503,
          "RESULT_REQUIRES_VERIFICATION"
        );
      }
      result = recovered;
    }
    return privateJson({
      state: "SUCCESS",
      message: "Opération enregistrée.",
      transfer: result
    });
  } catch (caught) {
    return mapAgentTransferError(caught);
  }
}

async function recoverTimedOutTransition(
  action: Exclude<TransfertsWriteAction, "CREATE_TRANSFER">,
  actor: Parameters<typeof callTransfertsReadApi>[1],
  transferId: string
) {
  const targetStatus = {
    CONFIRM_CODE_RECEIVED: "CODE_RECU",
    CONFIRM_FUNDS_WITHDRAWN: "FONDS_RETIRES",
    CONFIRM_TRANSFER: "CONFIRME",
    FLAG_FOR_REVIEW: "A_VERIFIER",
    CANCEL_TRANSFER: "ANNULE"
  }[action];
  const transfer = await callTransfertsReadApi("GET_TRANSFER", actor, { transferId }) as TransferSummary;
  return transfer.status === targetStatus ? transfer : null;
}

export function mapAgentTransferError(caught: unknown) {
  if (caught instanceof TransferValidationError) return error(caught.message, 400, "INVALID_REQUEST");
  if (caught instanceof TransferActionError) {
    return error(caught.message, caught.code === "FORBIDDEN" ? 403 : 422, caught.code);
  }
  if (caught instanceof TransfertsConfigurationError) {
    return error("Le module Transferts n’est pas configuré.", 503, "SERVICE_UNAVAILABLE");
  }
  if (caught instanceof TransfertsServiceError) {
    const mapped = mapRemoteCode(caught.code);
    return error(mapped.message, mapped.status, mapped.state);
  }
  if (caught instanceof SyntaxError) return error("Corps de requête invalide.", 400, "INVALID_REQUEST");
  if (caught instanceof Error && caught.name === "AbortError") {
    return error(
      "Le résultat de cette opération doit être vérifié avant une nouvelle tentative.",
      503,
      "RESULT_REQUIRES_VERIFICATION"
    );
  }
  return error("Le service Transferts est temporairement indisponible.", 503, "SERVICE_UNAVAILABLE");
}

function mapRemoteCode(code: string) {
  if (["TRANSFERT_INTROUVABLE", "TRANSFER_NOT_FOUND"].includes(code)) {
    return { status: 404, state: "NOT_FOUND", message: "Transfert introuvable." };
  }
  if (/CONFLICT|IDEMPOTENCE|DEJA/.test(code)) {
    return { status: 409, state: "CONFLICT", message: "Cette opération a déjà été traitée ou entre en conflit avec une demande existante." };
  }
  if (/TRANSITION|STATUT/.test(code)) {
    return { status: 422, state: "INVALID_TRANSITION", message: "Transition non autorisée pour le statut actuel." };
  }
  if (/FORBIDDEN|INTERDITE|AGENCE/.test(code)) {
    return { status: 403, state: "FORBIDDEN", message: "Action interdite." };
  }
  if (code === "HTTP_WRITES_DISABLED") {
    return { status: 503, state: "WRITES_DISABLED", message: "Les opérations de transfert ne sont pas encore activées." };
  }
  return { status: 503, state: "SERVICE_UNAVAILABLE", message: "Le service Transferts est temporairement indisponible." };
}

export async function readJson(request: Request) {
  return request.json();
}

export function error(message: string, status: number, state: string) {
  return privateJson({ state, message }, status);
}

export function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
