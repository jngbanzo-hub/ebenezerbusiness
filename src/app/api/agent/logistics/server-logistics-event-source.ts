import type { LogisticsEventSource } from "./logistics-event-source";
import { localLogisticsEventSource } from "./local-logistics-source";

export const LOGISTICS_SUPABASE_SOURCE_ENABLED =
  "LOGISTICS_SUPABASE_SOURCE_ENABLED";

export function selectLogisticsEventSource(
  value: string | undefined,
  sources: Readonly<{
    local: LogisticsEventSource;
    supabase: LogisticsEventSource;
  }>,
): LogisticsEventSource {
  return value?.trim().toLowerCase() === "true"
    ? sources.supabase
    : sources.local;
}

const lazySupabaseLogisticsEventSource: LogisticsEventSource = {
  async readEventsByTrackingCode(trackingCode) {
    const { createServerSupabaseLogisticsEventSource } = await import(
      "../../../../server/logistics-supabase-service-client"
    );
    return createServerSupabaseLogisticsEventSource().readEventsByTrackingCode(
      trackingCode,
    );
  },
};

export const serverLogisticsEventSource = selectLogisticsEventSource(
  process.env.LOGISTICS_SUPABASE_SOURCE_ENABLED,
  {
    local: localLogisticsEventSource,
    supabase: lazySupabaseLogisticsEventSource,
  },
);
