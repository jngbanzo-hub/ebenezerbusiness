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
  "INVALID_POSITION",
  "INVALID_TRANSITION",
  "INVALID_COMMAND",
  "INVALID_IDEMPOTENCY",
  "INVALID_REROUTING",
  "INVALID_DELIVERY",
  "INVALID_TARIFF",
  "ARRIVAL_MISMATCH_EXPECTED_AGENCY_INVALID",
  "ARRIVAL_MISMATCH_ACTUAL_AGENCY_INVALID",
  "ARRIVAL_MISMATCH_AGENT_AGENCY_INVALID",
  "PHYSICAL_RECEIPT_REQUIRED",
  "ARRIVAL_MISMATCH_REASON_REQUIRED",
  "ARRIVAL_MISMATCH_EVIDENCE_REQUIRED",
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
