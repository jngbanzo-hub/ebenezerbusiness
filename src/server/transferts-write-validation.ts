import type {
  CreateTransferInput,
  TransferAgency,
  TransferCurrency,
  TransferStatus,
  TransferSummary
} from "@/features/transferts/types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TRANSFER_ID = /^[A-Za-z0-9-]{1,100}$/;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f<>]/;
const CURRENCIES = new Set<TransferCurrency>(["USD", "CDF", "XOF"]);
const AGENCIES = new Set<TransferAgency>(["COO", "FIH", "LSHI", "KLZ"]);

export class TransferValidationError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}

export function validateCreateTransferInput(
  value: unknown,
  agencyFrom: TransferAgency
): CreateTransferInput & { agencyFrom: TransferAgency; agentFrom?: string } {
  const body = exactRecord(value, [
    "agencyTo", "amount", "currency", "fees", "service", "transferCode",
    "senderName", "beneficiaryName", "beneficiaryPhone",
    "transferRequestId", "observation"
  ]);
  const agencyTo = agency(body.agencyTo, "agencyTo");
  assertCircuit(agencyFrom, agencyTo);
  const amount = finiteNumber(body.amount, "amount", true);
  const fees = finiteNumber(body.fees, "fees", false);
  if (fees > amount) throw new TransferValidationError("fees", "Les frais ne peuvent pas dépasser le montant.");
  const currency = text(body.currency, "currency", 3).toUpperCase() as TransferCurrency;
  if (!CURRENCIES.has(currency)) throw new TransferValidationError("currency", "Devise invalide.");
  const transferRequestId = text(body.transferRequestId, "transferRequestId", 36);
  if (!UUID.test(transferRequestId)) throw new TransferValidationError("transferRequestId", "Identifiant de tentative invalide.");
  const observation = optionalText(body.observation, "observation", 500);
  return {
    agencyFrom,
    agencyTo,
    amount,
    currency,
    fees,
    service: text(body.service, "service", 80),
    transferCode: text(body.transferCode, "transferCode", 128),
    senderName: text(body.senderName, "senderName", 120),
    beneficiaryName: text(body.beneficiaryName, "beneficiaryName", 120),
    beneficiaryPhone: optionalText(body.beneficiaryPhone, "beneficiaryPhone", 40),
    transferRequestId,
    ...(observation ? { observation } : {})
  };
}

export function validateTransitionBody(value: unknown, withMotif: boolean) {
  const body = exactRecord(value, withMotif ? ["motif"] : []);
  return withMotif ? { motif: text(body.motif, "motif", 500) } : {};
}

export function validateTransferId(value: string) {
  const transferId = decodeURIComponent(value || "").trim();
  if (!SAFE_TRANSFER_ID.test(transferId)) {
    throw new TransferValidationError("transferId", "Transfer ID invalide.");
  }
  return transferId;
}

export type AgentTransferAction =
  | "CONFIRM_CODE_RECEIVED"
  | "CONFIRM_FUNDS_WITHDRAWN"
  | "CONFIRM_TRANSFER"
  | "FLAG_FOR_REVIEW"
  | "CANCEL_TRANSFER";

export function assertAgentMayPerformTransferAction(
  action: AgentTransferAction,
  transfer: TransferSummary,
  actorAgency: TransferAgency
) {
  const party =
    transfer.agencyFrom === actorAgency || transfer.agencyTo === actorAgency;
  if (!party) throw new TransferActionError("FORBIDDEN", "Action interdite pour cette agence.");

  const rules: Record<AgentTransferAction, {
    states: TransferStatus[];
    beneficiaryOnly?: boolean;
  }> = {
    CONFIRM_CODE_RECEIVED: { states: ["ENVOYE", "A_VERIFIER"], beneficiaryOnly: true },
    CONFIRM_FUNDS_WITHDRAWN: { states: ["CODE_RECU", "A_VERIFIER"], beneficiaryOnly: true },
    CONFIRM_TRANSFER: { states: ["FONDS_RETIRES", "A_VERIFIER"] },
    FLAG_FOR_REVIEW: { states: ["ENVOYE", "CODE_RECU", "FONDS_RETIRES"] },
    CANCEL_TRANSFER: { states: ["ENVOYE", "CODE_RECU", "A_VERIFIER"] }
  };
  const rule = rules[action];
  if (rule.beneficiaryOnly && transfer.agencyTo !== actorAgency) {
    throw new TransferActionError("FORBIDDEN", "Action réservée à l’agence bénéficiaire.");
  }
  if (!rule.states.includes(transfer.status)) {
    throw new TransferActionError("INVALID_TRANSITION", "Transition non autorisée pour le statut actuel.");
  }
}

export class TransferActionError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_TRANSITION", message: string) {
    super(message);
  }
}

export function assertCircuit(from: TransferAgency, to: TransferAgency) {
  if (from === to || (from !== "COO" && to !== "COO")) {
    throw new TransferValidationError("agencyTo", "Circuit de transfert interdit.");
  }
}

function agency(value: unknown, field: string) {
  const normalized = text(value, field, 4).toUpperCase() as TransferAgency;
  if (!AGENCIES.has(normalized)) throw new TransferValidationError(field, "Agence invalide.");
  return normalized;
}

function exactRecord(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TransferValidationError("body", "Corps de requête invalide.");
  }
  const body = value as Record<string, unknown>;
  const allowed = new Set(keys);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new TransferValidationError(key, "Champ inconnu.");
  }
  return body;
}

function finiteNumber(value: unknown, field: string, strictlyPositive: boolean) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TransferValidationError(field, "Nombre invalide.");
  }
  if (strictlyPositive ? value <= 0 : value < 0) {
    throw new TransferValidationError(field, "Valeur hors limites.");
  }
  return value;
}

function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string") throw new TransferValidationError(field, "Texte obligatoire.");
  const normalized = value.trim();
  if (!normalized || normalized.length > max || UNSAFE_TEXT.test(normalized)) {
    throw new TransferValidationError(field, "Texte invalide.");
  }
  return normalized;
}

function optionalText(value: unknown, field: string, max: number) {
  if (value === undefined || value === null || value === "") return "";
  return text(value, field, max);
}
