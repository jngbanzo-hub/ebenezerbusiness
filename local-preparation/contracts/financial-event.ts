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
  if (
    (input.eventType === "FINANCIAL_REVERSAL") !==
    (input.status === "REVERSED")
  ) {
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
  if (eventType === "FINANCIAL_REVERSAL") {
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
