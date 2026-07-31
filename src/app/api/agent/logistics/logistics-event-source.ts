import type { StockEvent } from "../../../../../local-preparation/contracts/stock-event";

export interface LogisticsEventSource {
  readEventsByTrackingCode(
    trackingCode: string,
  ): Promise<readonly StockEvent[] | null>;
}

export type LogisticsEventSourceErrorCode =
  | "SOURCE_NOT_CONFIGURED"
  | "SOURCE_READ_FAILED";

export class LogisticsEventSourceError extends Error {
  readonly code: LogisticsEventSourceErrorCode;

  constructor(code: LogisticsEventSourceErrorCode, message: string) {
    super(message);
    this.name = "LogisticsEventSourceError";
    this.code = code;
  }
}
