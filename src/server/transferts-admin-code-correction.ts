import "server-only";

import { NextResponse } from "next/server";

import type {
  CorrectTransferCodeInput,
  TransferSummary
} from "@/features/transferts/types";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import {
  callTransfertsReadApi,
  callTransfertsWriteApi,
  TransfertsConfigurationError,
  TransfertsServiceError
} from "@/server/transferts-apps-script";
import { getTransfertsFeatureFlags } from "@/server/transferts-feature-flags";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSFER_ID = /^[A-Za-z0-9-]{1,100}$/;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f<>]/;

export async function correctTransferCodeAsAdmin(
  request: Request,
  rawTransferId: string
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) {
      return response(
        authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit.",
        authorization.status
      );
    }
    if (!authorization.agency) {
      return response("NOT_CONFIGURED", "Agence de traçabilité Admin manquante.", 503);
    }
    const flags = getTransfertsFeatureFlags();
    if (!flags.adminEnabled || !flags.writesEnabled) {
      return response("WRITES_DISABLED", "La correction administrative n’est pas activée.", 503);
    }

    const transferId = decodeURIComponent(rawTransferId || "").trim();
    if (!TRANSFER_ID.test(transferId)) {
      return response("INVALID_REQUEST", "Transfer ID invalide.", 400);
    }
    const input = validateCorrectionInput(await request.json());
    const actor = {
      userId: authorization.userId,
      email: authorization.email,
      role: "ADMIN",
      agency: authorization.agency
    } as const;
    const transfer = await callTransfertsReadApi(
      "GET_TRANSFER",
      actor,
      { transferId }
    ) as TransferSummary;
    assertCorrectionAllowed(transfer);
    const corrected = await callTransfertsWriteApi(
      "ADMIN_CORRECT_TRANSFER_CODE",
      actor,
      {
        transferId,
        newTransferCode: input.newTransferCode,
        motif: input.motif,
        correctionRequestId: input.correctionRequestId
      }
    );
    return privateJson({
      state: "SUCCESS",
      message: "Le code du transfert a été corrigé.",
      transfer: corrected
    });
  } catch (error) {
    if (error instanceof CorrectionValidationError) {
      return response(error.state, error.message, error.status);
    }
    if (error instanceof SyntaxError) {
      return response("INVALID_REQUEST", "Corps de requête invalide.", 400);
    }
    if (error instanceof TransfertsConfigurationError) {
      return response("NOT_CONFIGURED", "Le module Transferts n’est pas configuré.", 503);
    }
    if (error instanceof TransfertsServiceError) {
      if (/CONFLICT|IDEMPOTENCE/.test(error.code)) {
        return response("CONFLICT", "Cette correction entre en conflit avec une demande existante.", 409);
      }
      if (/STATUS|TRANSITION|NOT_ALLOWED/.test(error.code)) {
        return response("INVALID_TRANSITION", "La correction est interdite pour l’état actuel.", 422);
      }
    }
    return response("SERVICE_UNAVAILABLE", "Le service Transferts est temporairement indisponible.", 503);
  }
}

export function validateCorrectionInput(value: unknown): CorrectTransferCodeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CorrectionValidationError("INVALID_REQUEST", "Corps de requête invalide.", 400);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    "newTransferCode",
    "confirmTransferCode",
    "motif",
    "correctionRequestId"
  ]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new CorrectionValidationError("INVALID_REQUEST", "Champ inconnu.", 400);
    }
  }
  const newTransferCode = safeText(record.newTransferCode, 128, "Nouveau code invalide.");
  const confirmTransferCode = safeText(record.confirmTransferCode, 128, "Confirmation du code invalide.");
  if (newTransferCode !== confirmTransferCode) {
    throw new CorrectionValidationError("INVALID_REQUEST", "Les deux codes ne correspondent pas.", 400);
  }
  const motif = safeText(record.motif, 500, "Motif obligatoire.");
  const correctionRequestId =
    typeof record.correctionRequestId === "string"
      ? record.correctionRequestId.trim()
      : "";
  if (!UUID.test(correctionRequestId)) {
    throw new CorrectionValidationError("INVALID_REQUEST", "Identifiant de correction invalide.", 400);
  }
  return { newTransferCode, confirmTransferCode, motif, correctionRequestId };
}

export function assertCorrectionAllowed(transfer: TransferSummary) {
  if (
    transfer.status === "FONDS_RETIRES" ||
    transfer.status === "CONFIRME" ||
    transfer.status === "ANNULE" ||
    (transfer.status === "A_VERIFIER" && Boolean(transfer.fundsWithdrawnAt))
  ) {
    throw new CorrectionValidationError(
      "INVALID_TRANSITION",
      "La correction est interdite pour l’état actuel.",
      422
    );
  }
  if (!["ENVOYE", "CODE_RECU", "A_VERIFIER"].includes(transfer.status)) {
    throw new CorrectionValidationError("INVALID_TRANSITION", "État du transfert invalide.", 422);
  }
}

export class CorrectionValidationError extends Error {
  constructor(
    readonly state: string,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function safeText(value: unknown, max: number, message: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max || UNSAFE_TEXT.test(normalized)) {
    throw new CorrectionValidationError("INVALID_REQUEST", message, 400);
  }
  return normalized;
}

function response(state: string, message: string, status: number) {
  return privateJson({ state, message }, status);
}

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
