export const CONTRACT_ERROR_CODES = [
  "INVALID_AGENCY",
  "INVALID_AMOUNT",
  "INVALID_CURRENCY",
  "INVALID_EVENT_TYPE",
  "INVALID_EVENT_STATUS",
  "INVALID_EVENT_ID",
  "INVALID_REQUEST_ID",
  "INVALID_SOURCE_ID",
  "INVALID_ACTOR",
  "INVALID_OCCURRED_AT",
  "INVALID_BUSINESS_DATE",
  "INVALID_VERSION",
  "INVALID_REVERSAL",
  "INVALID_PARCEL_CODE",
  "INVALID_WEIGHT",
  "INVALID_METADATA",
] as const;

export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

export class ContractValidationError extends Error {
  readonly code: ContractErrorCode;

  constructor(code: ContractErrorCode, publicMessage: string) {
    super(publicMessage);
    this.name = "ContractValidationError";
    this.code = code;
  }
}

export function contractError(
  code: ContractErrorCode,
  publicMessage: string,
): ContractValidationError {
  return new ContractValidationError(code, publicMessage);
}
