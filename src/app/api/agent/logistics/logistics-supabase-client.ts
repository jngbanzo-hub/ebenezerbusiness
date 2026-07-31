import type {
  LogisticsEventInsertRow,
  LogisticsEventRow,
} from "./logistics-event-row";

export const LOGISTICS_EVENT_COLUMNS = [
  "id",
  "parcel_id",
  "tracking_code",
  "event_type",
  "version_before",
  "version_after",
  "occurred_at",
  "source",
  "payload",
  "created_at",
] as const;

export type LogisticsSupabaseReadRequest = Readonly<{
  table: "logistics_events";
  columns: typeof LOGISTICS_EVENT_COLUMNS;
  filter: Readonly<{
    column: "tracking_code";
    operator: "eq";
    value: string;
  }>;
  order: readonly [
    Readonly<{ column: "parcel_id"; ascending: true }>,
    Readonly<{ column: "version_after"; ascending: true }>,
    Readonly<{ column: "occurred_at"; ascending: true }>,
    Readonly<{ column: "id"; ascending: true }>,
  ];
}>;

export type LogisticsSupabaseReadResult = Readonly<{
  data: readonly LogisticsEventRow[] | null;
  error: Readonly<{ message: string }> | null;
}>;

export interface LogisticsSupabaseClient {
  readLogisticsEvents(
    request: LogisticsSupabaseReadRequest,
  ): Promise<LogisticsSupabaseReadResult>;
}

export type LogisticsSupabaseInsertRequest = Readonly<{
  table: "logistics_events";
  row: LogisticsEventInsertRow;
}>;

export type LogisticsSupabaseInsertResult = Readonly<{
  data: Readonly<{ id: string }> | null;
  error: Readonly<{ code: string; message: string }> | null;
}>;

export interface LogisticsSupabaseWriteClient {
  insertLogisticsEvent(
    request: LogisticsSupabaseInsertRequest,
  ): Promise<LogisticsSupabaseInsertResult>;
}
