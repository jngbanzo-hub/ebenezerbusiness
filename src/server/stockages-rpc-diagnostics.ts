export type StockagesRpcFailure = Readonly<{
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}>;

export type StockagesRpcDiagnosticContext = Readonly<{
  rpc: string;
  agency?: string;
  commandType: string;
}>;

export function buildStockagesRpcDiagnostic(
  diagnosticId: string,
  error: StockagesRpcFailure,
  context: StockagesRpcDiagnosticContext
) {
  return Object.freeze({
    diagnosticId,
    rpc: context.rpc,
    agency: context.agency ?? "UNKNOWN",
    commandType: context.commandType,
    code: clean(error.code),
    message: clean(error.message),
    details: clean(error.details),
    hint: clean(error.hint)
  });
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
