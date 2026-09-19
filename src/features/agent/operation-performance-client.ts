export function logOperationPerformance(input: {
  operation: "encaissement" | "depense";
  requestId: string;
  agency: string;
  startedAt: number;
  response?: Response;
  result: "success" | "error";
}) {
  console.info(JSON.stringify({
    type: "operation_performance_ui",
    operation: input.operation,
    requestId: safeLabel(input.requestId),
    agency: safeLabel(input.agency),
    result: input.result,
    totalMs: Math.round((performance.now() - input.startedAt) * 10) / 10,
    serverTiming: input.response?.headers.get("Server-Timing") ?? ""
  }));
}

function safeLabel(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 128);
}
