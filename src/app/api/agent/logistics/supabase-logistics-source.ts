import {
  LogisticsEventSourceError,
  type LogisticsEventSource,
} from "./logistics-event-source";
import {
  decodeLogisticsEventRows,
  type LogisticsEventRow,
} from "./logistics-event-row";

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
