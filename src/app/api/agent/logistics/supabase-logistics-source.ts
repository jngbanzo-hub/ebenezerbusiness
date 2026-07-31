import {
  LogisticsEventSourceError,
  type LogisticsEventSource,
} from "./logistics-event-source";

export class UnconfiguredSupabaseLogisticsEventSource
  implements LogisticsEventSource
{
  async readEventsByTrackingCode(_trackingCode: string): Promise<never> {
    throw new LogisticsEventSourceError(
      "SOURCE_NOT_CONFIGURED",
      "La source logistique Supabase n’est pas configurée.",
    );
  }
}
