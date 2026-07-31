import "server-only";

import { createClient } from "@supabase/supabase-js";

import { SupabaseLogisticsEventProducer } from "@/app/api/agent/logistics/logistics-event-producer";
import type {
  LogisticsSupabaseInsertRequest,
  LogisticsSupabaseInsertResult,
  LogisticsSupabaseWriteClient,
} from "@/app/api/agent/logistics/logistics-supabase-client";

export class LogisticsServiceConfigurationError extends Error {
  constructor() {
    super("Configuration du producteur logistique manquante.");
    this.name = "LogisticsServiceConfigurationError";
  }
}

export function createServerLogisticsEventProducer() {
  return new SupabaseLogisticsEventProducer(
    createSupabaseLogisticsWriteClient(),
  );
}

function createSupabaseLogisticsWriteClient(): LogisticsSupabaseWriteClient {
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
