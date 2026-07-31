import "server-only";

import { createClient } from "@supabase/supabase-js";

import { SupabaseLogisticsEventProducer } from "@/app/api/agent/logistics/logistics-event-producer";
import type { LogisticsEventRow } from "@/app/api/agent/logistics/logistics-event-row";
import type {
  LogisticsSupabaseInsertRequest,
  LogisticsSupabaseInsertResult,
  LogisticsSupabaseClient,
  LogisticsSupabaseReadRequest,
  LogisticsSupabaseReadResult,
  LogisticsSupabaseWriteClient,
} from "@/app/api/agent/logistics/logistics-supabase-client";
import { SupabaseLogisticsEventSource } from "@/app/api/agent/logistics/supabase-logistics-source";

export class LogisticsServiceConfigurationError extends Error {
  constructor() {
    super("Configuration du producteur logistique manquante.");
    this.name = "LogisticsServiceConfigurationError";
  }
}

export function createServerLogisticsEventProducer() {
  return new SupabaseLogisticsEventProducer(
    createSupabaseLogisticsClient(),
  );
}

export function createServerSupabaseLogisticsEventSource() {
  return new SupabaseLogisticsEventSource(createSupabaseLogisticsClient());
}

function createSupabaseLogisticsClient(): LogisticsSupabaseClient &
  LogisticsSupabaseWriteClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new LogisticsServiceConfigurationError();
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return {
    async readLogisticsEvents(
      request: LogisticsSupabaseReadRequest,
    ): Promise<LogisticsSupabaseReadResult> {
      let query = client
        .schema("public")
        .from(request.table)
        .select(request.columns.join(","))
        .eq(request.filter.column, request.filter.value);

      request.order.forEach((order) => {
        query = query.order(order.column, { ascending: order.ascending });
      });

      const { data, error } = await query;
      return {
        data:
          data === null
            ? null
            : (data as unknown as readonly LogisticsEventRow[]),
        error: error === null ? null : { message: error.message },
      };
    },
    async insertLogisticsEvent(
      request: LogisticsSupabaseInsertRequest,
    ): Promise<LogisticsSupabaseInsertResult> {
      const { data, error } = await client
        .schema("public")
        .from(request.table)
        .insert({
          ...request.row,
          agency_scope: [...request.row.agency_scope],
        })
        .select("id")
        .single();

      return {
        data:
          data !== null && typeof data.id === "string"
            ? { id: data.id }
            : null,
        error:
          error === null
            ? null
            : {
                code: error.code,
                message: error.message,
              },
      };
    },
  };
}
