import "server-only";

import { NextResponse } from "next/server";

import type { TransferSummary } from "@/features/transferts/types";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import {
  callTransfertsReadApi,
  callTransfertsWriteApi,
  TransfertsConfigurationError,
  TransfertsServiceError
} from "@/server/transferts-apps-script";
import { assertCorrectionAllowed, CorrectionValidationError } from "@/server/transferts-admin-code-correction";
import { getTransfertsFeatureFlags } from "@/server/transferts-feature-flags";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSFER_ID = /^[A-Za-z0-9-]{1,100}$/;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f<>]/;

type CorrectionKind = "amount" | "beneficiary";

export async function correctTransferFieldAsAdmin(
  request: Request,
  rawTransferId: string,
  kind: CorrectionKind
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
    const input = validateFieldCorrectionInput(await request.json(), kind);
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
    if (kind === "amount" && input.newAmount! < transfer.fees) {
      throw new CorrectionValidationError(
        "INVALID_REQUEST",
        "Le montant ne peut pas être inférieur aux frais existants.",
        400
      );
    }
    const corrected = await callTransfertsWriteApi(
      kind === "amount"
        ? "ADMIN_CORRECT_TRANSFER_AMOUNT"
        : "ADMIN_CORRECT_TRANSFER_BENEFICIARY",
      actor,
      { transferId, ...input }
    );
    return privateJson({
      state: "SUCCESS",
      message: kind === "amount"
        ? "Le montant du transfert a été corrigé."
        : "Le bénéficiaire du transfert a été corrigé.",
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
      if (/CONFLICT|IDEMPOTENCE|IN_PROGRESS/.test(error.code)) {
        return response("CONFLICT", "Cette correction entre en conflit avec une demande existante.", 409);
      }
      if (/STATUS|TRANSITION|NOT_ALLOWED|AFTER_WITHDRAWAL/.test(error.code)) {
        return response("INVALID_TRANSITION", "La correction est interdite pour l’état actuel.", 422);
      }
      if (/AMOUNT|MONTANT|NET|FEES|FRAIS|IDENTICAL/.test(error.code)) {
        return response("INVALID_REQUEST", "La nouvelle valeur est invalide.", 400);
      }
    }
    return response("SERVICE_UNAVAILABLE", "Le service Transferts est temporairement indisponible.", 503);
  }
}

export function validateFieldCorrectionInput(value: unknown, kind: CorrectionKind) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CorrectionValidationError("INVALID_REQUEST", "Corps de requête invalide.", 400);
  }
  const record = value as Record<string, unknown>;
  const valueKey = kind === "amount" ? "newAmount" : "newBeneficiaryName";
  const allowed = new Set([valueKey, "correctionRequestId"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new CorrectionValidationError("INVALID_REQUEST", "Champ inconnu.", 400);
  }
  const correctionRequestId = typeof record.correctionRequestId === "string"
    ? record.correctionRequestId.trim()
    : "";
  if (!UUID.test(correctionRequestId)) {
    throw new CorrectionValidationError("INVALID_REQUEST", "Identifiant de correction invalide.", 400);
  }
  if (kind === "amount") {
    const amount = typeof record.newAmount === "number" ? record.newAmount : Number.NaN;
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      throw new CorrectionValidationError("INVALID_REQUEST", "Nouveau montant invalide.", 400);
    }
    return { newAmount: amount, correctionRequestId };
  }
  const name = typeof record.newBeneficiaryName === "string" ? record.newBeneficiaryName.trim() : "";
  if (!name || name.length > 200 || UNSAFE_TEXT.test(name)) {
    throw new CorrectionValidationError("INVALID_REQUEST", "Nouveau bénéficiaire invalide.", 400);
  }
  return { newBeneficiaryName: name, correctionRequestId };
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
