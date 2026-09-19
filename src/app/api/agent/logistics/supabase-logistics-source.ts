import {
  LogisticsEventSourceError,
  type LogisticsEventSource,
} from "./logistics-event-source";
import {
  decodeLogisticsEventRows,
  type LogisticsEventRow,
} from "./logistics-event-row";
import {
  LOGISTICS_EVENT_COLUMNS,
  type LogisticsSupabaseClient,
  type LogisticsSupabaseReadRequest,
} from "./logistics-supabase-client";

const DETERMINISTIC_ORDER = [
  { column: "parcel_id", ascending: true },
  { column: "version_after", ascending: true },
  { column: "occurred_at", ascending: true },
  { column: "id", ascending: true },
] as const;

export class SupabaseLogisticsEventSource implements LogisticsEventSource {
  constructor(private readonly client: LogisticsSupabaseClient) {}

  async readEventsByTrackingCode(trackingCode: string) {
    const request: LogisticsSupabaseReadRequest = {
      table: "logistics_events",
      columns: LOGISTICS_EVENT_COLUMNS,
      filter: {
        column: "tracking_code",
        operator: "eq",
        value: trackingCode,
      },
      order: DETERMINISTIC_ORDER,
    };
    const result = await this.client.readLogisticsEvents(request);

    if (result.error !== null) {
      throw new LogisticsEventSourceError(
        "SOURCE_READ_FAILED",
        "La lecture de la source logistique a échoué.",
      );
    }
    if (result.data === null || result.data.length === 0) {
      return null;
    }

    return decodeLogisticsEventRows(result.data);
  }
}

export class UnconfiguredSupabaseLogisticsEventSource
  implements LogisticsEventSource
{
  decodeRows(rows: readonly LogisticsEventRow[]) {
    return decodeLogisticsEventRows(rows);
  }

  async readEventsByTrackingCode(_trackingCode: string): Promise<never> {
    throw new LogisticsEventSourceError(
      "SOURCE_NOT_CONFIGURED",
      "La source logistique Supabase n’est pas configurée.",
    );
  }
}
