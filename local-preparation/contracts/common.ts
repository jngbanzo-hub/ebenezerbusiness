import { contractError, type ContractErrorCode } from "./errors";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

const SENSITIVE_METADATA_KEY =
  /(^|[_-])(api[_-]?key|authorization|bearer|password|private[_-]?key|secret|token)($|[_-])/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateIdentifier(
  value: unknown,
  code: ContractErrorCode,
  publicMessage: string,
): string {
  if (typeof value !== "string") {
    throw contractError(code, publicMessage);
  }

  const normalized = value.trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw contractError(code, publicMessage);
  }

  return normalized;
}

export function validateOptionalRequestId(
  value: unknown,
  required: boolean,
): string | null {
  if (value === null && !required) {
    return null;
  }
  if (value === undefined && !required) {
    return null;
  }

  return validateIdentifier(
    value,
    "INVALID_REQUEST_ID",
    "Identifiant de requête invalide.",
  );
}

export function validateOccurredAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    !ISO_INSTANT_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw contractError("INVALID_OCCURRED_AT", "Horodatage invalide.");
  }

  return value;
}

export function validateBusinessDate(value: unknown): string {
  if (typeof value !== "string" || !BUSINESS_DATE_PATTERN.test(value)) {
    throw contractError("INVALID_BUSINESS_DATE", "Date métier invalide.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw contractError("INVALID_BUSINESS_DATE", "Date métier invalide.");
  }

  return value;
}

export function validateVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw contractError("INVALID_VERSION", "Version invalide.");
  }

  return value as number;
}

export function validatePositiveAmount(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 1e-9
  ) {
    throw contractError("INVALID_AMOUNT", "Montant invalide.");
  }

  return value;
}

export function validatePositiveWeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw contractError("INVALID_WEIGHT", "Poids invalide.");
  }

  return value;
}

export function validateMetadata(value: unknown): JsonObject {
  if (!isPlainObject(value)) {
    throw contractError("INVALID_METADATA", "Métadonnées invalides.");
  }

  validateJsonValue(value, new Set<object>());
  return deepFreeze(value as JsonObject);
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((item) => {
      deepFreeze(item);
    });
  }

  return value;
}

function validateJsonValue(value: unknown, ancestors: Set<object>): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw contractError("INVALID_METADATA", "Métadonnées invalides.");
    }
    return;
  }

  if (typeof value !== "object") {
    throw contractError("INVALID_METADATA", "Métadonnées invalides.");
  }

  if (ancestors.has(value)) {
    throw contractError("INVALID_METADATA", "Métadonnées invalides.");
  }

  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw contractError("INVALID_METADATA", "Métadonnées invalides.");
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => validateJsonValue(item, ancestors));
  } else {
    Object.entries(value).forEach(([key, item]) => {
      if (SENSITIVE_METADATA_KEY.test(key)) {
        throw contractError("INVALID_METADATA", "Métadonnées invalides.");
      }
      validateJsonValue(item, ancestors);
    });
  }
  ancestors.delete(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
