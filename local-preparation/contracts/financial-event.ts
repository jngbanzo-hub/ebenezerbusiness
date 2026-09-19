import {
  deepFreeze,
  type JsonObject,
  validateBusinessDate,
  validateIdentifier,
  validateMetadata,
  validateOccurredAt,
  validateOptionalRequestId,
  validatePositiveAmount,
  validateVersion,
} from "./common";
import { normalizeCanonicalAgency, type CanonicalAgency } from "./agencies";
import { contractError } from "./errors";

export const FINANCIAL_EVENT_TYPES = [
  "PAYMENT_RECORDED",
  "EXPENSE_RECORDED",
  "EXPENSE_APPROVED",
  "EXPENSE_REJECTED",
  "FINANCIAL_ADJUSTMENT",
  "OPENING_BALANCE_RECORDED",
  "REROUTING_FEE_ASSESSED",
  "REROUTING_FEE_REVERSED",
  "FINANCIAL_REVERSAL",
] as const;

export const FINANCIAL_EVENT_STATUSES = [
  "RECORDED",
  "APPROVED",
  "REJECTED",
  "REVERSED",
] as const;

export const FINANCIAL_SOURCE_TYPES = [
  "PAYMENT_ENGINE",
  "EXPENSE_ENGINE",
  "ADMIN",
  "SYSTEM",
  "LEGACY_IMPORT",
] as const;

export type FinancialEventType = (typeof FINANCIAL_EVENT_TYPES)[number];
export type FinancialEventStatus = (typeof FINANCIAL_EVENT_STATUSES)[number];
export type FinancialSourceType = (typeof FINANCIAL_SOURCE_TYPES)[number];
export type CanonicalCurrency = "USD";
export type LegacyCurrency = "USD" | "FCFA" | "CDF";

export const SUPPLEMENTAL_RECEIVABLE_EVENT_TYPES = [
  "REROUTING_FEE_ASSESSED",
  "REROUTING_FEE_REVERSED",
] as const;
export type SupplementalReceivableEventType =
  (typeof SUPPLEMENTAL_RECEIVABLE_EVENT_TYPES)[number];

export type SupplementalReceivable = Readonly<{
  receivableId: string;
  parcelId: string;
  reroutingId: string;
  eventType: SupplementalReceivableEventType;
  amount: number;
  currency: "USD";
  tariffId: string;
  tariffVersion: number;
  calculationBasis: JsonObject;
  assessedAt: string;
  assessedBy: string;
  reversedBy: string | null;
  reversalReason: string | null;
  reversalOfReceivableId: string | null;
  requestId: string;
}>;

export type FinancialEvent = Readonly<{
  eventId: string;
  eventType: FinancialEventType;
  agency: CanonicalAgency;
  amount: number;
  currency: CanonicalCurrency;
  sourceType: FinancialSourceType;
  sourceId: string;
  requestId: string | null;
  occurredAt: string;
  businessDate: string;
  actorUserId: string | null;
  status: FinancialEventStatus;
  reversalOf: string | null;
  version: number;
  metadata: JsonObject;
}>;

export type FinancialEventInput = {
  eventId: string;
  eventType: FinancialEventType;
  agency: unknown;
  amount: number;
  currency: string;
  sourceType: FinancialSourceType;
  sourceId: string;
  requestId?: string | null;
  occurredAt: string;
  businessDate: string;
  actorUserId?: string | null;
  status: FinancialEventStatus;
  reversalOf?: string | null;
  version: number;
  metadata: unknown;
};

export type LegacyFinancialRecord = Readonly<{
  recordKind: "LEGACY_FINANCIAL_RECORD";
  sourceId: string;
  agency: CanonicalAgency;
  originalAmount: number;
  originalCurrency: LegacyCurrency;
  occurredAt: string;
  metadata: JsonObject;
}>;

export function createFinancialEvent(input: FinancialEventInput): FinancialEvent {
  if (!FINANCIAL_EVENT_TYPES.includes(input.eventType)) {
    throw contractError("INVALID_EVENT_TYPE", "Type d’événement invalide.");
  }
  if (!FINANCIAL_EVENT_STATUSES.includes(input.status)) {
    throw contractError("INVALID_EVENT_STATUS", "Statut d’événement invalide.");
  }
  const isReversalEvent =
    input.eventType === "FINANCIAL_REVERSAL" ||
    input.eventType === "REROUTING_FEE_REVERSED";
  if (isReversalEvent !== (input.status === "REVERSED")) {
    throw contractError("INVALID_EVENT_STATUS", "Statut d’événement invalide.");
  }
  if (!FINANCIAL_SOURCE_TYPES.includes(input.sourceType)) {
    throw contractError("INVALID_SOURCE_ID", "Source financière invalide.");
  }
  if (input.currency !== "USD") {
    throw contractError("INVALID_CURRENCY", "Devise invalide.");
  }

  const sourceIsSystem =
    input.sourceType === "SYSTEM" || input.sourceType === "LEGACY_IMPORT";
  const eventId = validateIdentifier(
    input.eventId,
    "INVALID_EVENT_ID",
    "Identifiant d’événement invalide.",
  );
  const reversalOf = validateReversal(input.eventType, input.reversalOf);
  const actorUserId =
    input.actorUserId === null || input.actorUserId === undefined
      ? null
      : validateIdentifier(
          input.actorUserId,
          "INVALID_ACTOR",
          "Identité acteur invalide.",
        );

  if (!sourceIsSystem && actorUserId === null) {
    throw contractError("INVALID_ACTOR", "Identité acteur invalide.");
  }

  return deepFreeze({
    eventId,
    eventType: input.eventType,
    agency: normalizeCanonicalAgency(input.agency),
    amount: validatePositiveAmount(input.amount),
    currency: "USD",
    sourceType: input.sourceType,
    sourceId: validateIdentifier(
      input.sourceId,
      "INVALID_SOURCE_ID",
      "Identifiant source invalide.",
    ),
    requestId: validateOptionalRequestId(input.requestId, !sourceIsSystem),
    occurredAt: validateOccurredAt(input.occurredAt),
    businessDate: validateBusinessDate(input.businessDate),
    actorUserId,
    status: input.status,
    reversalOf,
    version: validateVersion(input.version),
    metadata: validateMetadata(input.metadata),
  });
}

export function createLegacyFinancialRecord(input: {
  sourceId: string;
  agency: unknown;
  originalAmount: number;
  originalCurrency: LegacyCurrency;
  occurredAt: string;
  metadata: unknown;
}): LegacyFinancialRecord {
  if (!["USD", "FCFA", "CDF"].includes(input.originalCurrency)) {
    throw contractError("INVALID_CURRENCY", "Devise historique invalide.");
  }

  return deepFreeze({
    recordKind: "LEGACY_FINANCIAL_RECORD",
    sourceId: validateIdentifier(
      input.sourceId,
      "INVALID_SOURCE_ID",
      "Identifiant source invalide.",
    ),
    agency: normalizeCanonicalAgency(input.agency),
    originalAmount: validateLegacyAmount(input.originalAmount),
    originalCurrency: input.originalCurrency,
    occurredAt: validateOccurredAt(input.occurredAt),
    metadata: validateMetadata(input.metadata),
  });
}

export function createSupplementalReceivable(input: {
  receivableId: string;
  parcelId: string;
  reroutingId: string;
  eventType: SupplementalReceivableEventType;
  amount: number;
  currency: string;
  tariffId: string;
  tariffVersion: number;
  calculationBasis: unknown;
  assessedAt: string;
  assessedBy: string;
  reversedBy?: string | null;
  reversalReason?: string | null;
  reversalOfReceivableId?: string | null;
  requestId: string;
}): SupplementalReceivable {
  if (!SUPPLEMENTAL_RECEIVABLE_EVENT_TYPES.includes(input.eventType)) {
    throw contractError("INVALID_EVENT_TYPE", "Type de créance invalide.");
  }
  if (input.currency !== "USD") {
    throw contractError("INVALID_CURRENCY", "Devise invalide.");
  }
  if (!Number.isInteger(input.tariffVersion) || input.tariffVersion <= 0) {
    throw contractError("INVALID_TARIFF", "Version tarifaire invalide.");
  }
  const isReversal = input.eventType === "REROUTING_FEE_REVERSED";
  if (
    isReversal &&
    (!input.reversedBy ||
      !input.reversalReason ||
      !input.reversalOfReceivableId)
  ) {
    throw contractError("INVALID_REVERSAL", "Compensation financière invalide.");
  }
  if (
    !isReversal &&
    (input.reversedBy != null ||
      input.reversalReason != null ||
      input.reversalOfReceivableId != null)
  ) {
    throw contractError("INVALID_REVERSAL", "Compensation financière invalide.");
  }

  return deepFreeze({
    receivableId: validateIdentifier(
      input.receivableId,
      "INVALID_SOURCE_ID",
      "Identifiant de créance invalide.",
    ),
    parcelId: validateIdentifier(
      input.parcelId,
      "INVALID_SOURCE_ID",
      "Identifiant colis invalide.",
    ),
    reroutingId: validateIdentifier(
      input.reroutingId,
      "INVALID_SOURCE_ID",
      "Identifiant de réacheminement invalide.",
    ),
    eventType: input.eventType,
    amount: validatePositiveAmount(input.amount),
    currency: "USD",
    tariffId: validateIdentifier(
      input.tariffId,
      "INVALID_TARIFF",
      "Tarif invalide.",
    ),
    tariffVersion: input.tariffVersion,
    calculationBasis: validateMetadata(input.calculationBasis),
    assessedAt: validateOccurredAt(input.assessedAt),
    assessedBy: validateIdentifier(
      input.assessedBy,
      "INVALID_ACTOR",
      "Identité acteur invalide.",
    ),
    reversedBy:
      input.reversedBy == null
        ? null
        : validateIdentifier(
            input.reversedBy,
            "INVALID_ACTOR",
            "Identité acteur invalide.",
          ),
    reversalReason:
      input.reversalReason == null
        ? null
        : validateReason(input.reversalReason),
    reversalOfReceivableId:
      input.reversalOfReceivableId == null
        ? null
        : validateIdentifier(
            input.reversalOfReceivableId,
            "INVALID_REVERSAL",
            "Créance compensée invalide.",
          ),
    requestId: validateIdentifier(
      input.requestId,
      "INVALID_REQUEST_ID",
      "Identifiant de requête financière invalide.",
    ),
  });
}

export function projectParcelFinancials(input: {
  initialAmount: number;
  assessedFees: readonly SupplementalReceivable[];
  reversedReceivableIds: readonly string[];
  paymentsApplied: number;
}): Readonly<{
  montantInitial: number;
  totalDu: number;
  nouveauSolde: number;
}> {
  const montantInitial = validatePositiveAmount(input.initialAmount);
  if (
    typeof input.paymentsApplied !== "number" ||
    !Number.isFinite(input.paymentsApplied) ||
    input.paymentsApplied < 0
  ) {
    throw contractError("INVALID_AMOUNT", "Paiements appliqués invalides.");
  }
  const reversed = new Set(input.reversedReceivableIds);
  const fees = input.assessedFees
    .filter(
      (item) =>
        item.eventType === "REROUTING_FEE_ASSESSED" &&
        !reversed.has(item.receivableId),
    )
    .reduce((total, item) => total + item.amount, 0);
  const totalDu = roundMoney(montantInitial + fees);
  return deepFreeze({
    montantInitial,
    totalDu,
    nouveauSolde: roundMoney(Math.max(0, totalDu - input.paymentsApplied)),
  });
}

function validateLegacyAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw contractError("INVALID_AMOUNT", "Montant historique invalide.");
  }
  return value;
}

function validateReversal(
  eventType: FinancialEventType,
  value: string | null | undefined,
): string | null {
  if (
    eventType === "FINANCIAL_REVERSAL" ||
    eventType === "REROUTING_FEE_REVERSED"
  ) {
    return validateIdentifier(
      value,
      "INVALID_REVERSAL",
      "Référence de compensation invalide.",
    );
  }
  if (value !== null && value !== undefined) {
    throw contractError("INVALID_REVERSAL", "Référence de compensation invalide.");
  }
  return null;
}

function validateReason(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 3) {
    throw contractError("INVALID_REVERSAL", "Motif de compensation invalide.");
  }
  return value.trim();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
