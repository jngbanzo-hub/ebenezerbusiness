import "server-only";

type PerformanceResult = "success" | "error";

export class OperationPerformanceTrace {
  private readonly startedAt: number;
  private readonly durations = new Map<string, number>();
  private finished = false;

  constructor(
    private readonly operation: "encaissement" | "depense" | "shipment_tracking" | "shipment_tracking_update" | "arrivages",
    private readonly requestId: string,
    private readonly agency: string,
    startedAt = performance.now()
  ) {
    this.startedAt = startedAt;
  }

  private itemCount?: number;

  setItemCount(value: number) {
    if (Number.isInteger(value) && value >= 0) this.itemCount = value;
  }

  requestIdentifier() {
    return safeLabel(this.requestId);
  }

  async measure<T>(step: string, action: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await action();
    } finally {
      this.add(step, performance.now() - startedAt);
    }
  }

  add(step: string, durationMs: number) {
    const duration = finiteMilliseconds(durationMs);
    this.durations.set(step, (this.durations.get(step) ?? 0) + duration);
  }

  complete(result: PerformanceResult) {
    if (this.finished) return;
    this.finished = true;
    this.durations.set("total", finiteMilliseconds(performance.now() - this.startedAt));
    console.info(JSON.stringify({
      type: "operation_performance",
      operation: this.operation,
      requestId: safeLabel(this.requestId),
      agency: safeLabel(this.agency),
      itemCount: this.itemCount,
      result,
      durationsMs: Object.fromEntries(this.durations)
    }));
  }

  serverTiming() {
    return Array.from(this.durations.entries())
      .map(([step, duration]) => `${safeMetric(step)};dur=${duration.toFixed(1)}`)
      .join(", ");
  }

  snapshot() {
    return Object.freeze(Object.fromEntries(this.durations));
  }
}

function finiteMilliseconds(value: number) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : 0;
}

function safeLabel(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 128);
}

function safeMetric(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}
