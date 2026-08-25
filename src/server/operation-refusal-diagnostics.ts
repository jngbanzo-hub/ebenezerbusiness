export type RefusalOperation = "PAYMENT" | "DELIVERY";

type RefusalDiagnosticInput = Readonly<{
  diagnosticId?: string;
  requestId?: string;
  operation: RefusalOperation;
  agency?: string;
  stage: string;
  applicationCode: string;
  httpStatus: number;
  externalHttpStatus?: number;
  startedAt: number;
}>;

export function logOperationRefusal(input: RefusalDiagnosticInput) {
  const diagnosticId = safeIdentifier(input.diagnosticId) || crypto.randomUUID();
  const diagnostic = Object.freeze({
    type: "operation_refusal",
    diagnosticId,
    requestId: safeIdentifier(input.requestId) || null,
    operation: input.operation,
    agency: safeLabel(input.agency) || "UNKNOWN",
    stage: safeLabel(input.stage) || "UNKNOWN",
    applicationCode: safeLabel(input.applicationCode) || "UNKNOWN_ERROR",
    httpStatus: safeStatus(input.httpStatus),
    externalHttpStatus: safeOptionalStatus(input.externalHttpStatus),
    durationMs: elapsedMilliseconds(input.startedAt),
    result: "REFUSED",
    normalizedCause: safeLabel(input.applicationCode) || "UNKNOWN_ERROR"
  });
  console.error("[operation-refusal]", JSON.stringify(diagnostic));
  return diagnostic;
}

function safeIdentifier(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 128)
    : "";
}

function safeLabel(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 96)
    : "";
}

function safeStatus(value: number) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 500;
}

function safeOptionalStatus(value: number | undefined) {
  return value === undefined ? null : safeStatus(value);
}

function elapsedMilliseconds(startedAt: number) {
  const duration = performance.now() - startedAt;
  return Number.isFinite(duration) && duration >= 0 ? Math.round(duration * 10) / 10 : 0;
}
