import { authorizeAgentRequest } from "@/server/agent-authorization";
import { googleSheetsCooDepositParcelResolver } from "@/server/coo-deposit-parcel-resolver";
import { createServerLogisticsSupabaseClient } from "@/server/logistics-supabase-service-client";

import { CooDepositCommandService } from "../coo-deposit-command";
import { createCooDepositPostHandler } from "../coo-deposit-handler";
import { SupabaseLogisticsEventProducer } from "../logistics-event-producer";
import { LOGISTICS_EVENT_COLUMNS, type LogisticsSupabaseClient } from "../logistics-supabase-client";
import { decodeLogisticsEventRows } from "../logistics-event-row";
import { SupabaseLogisticsEventSource } from "../supabase-logistics-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const enabledHandler = createCooDepositPostHandler(authorizeAgentRequest, () => {
  const client = createServerLogisticsSupabaseClient();
  const eventSource = new SupabaseLogisticsEventSource(client);
  return new CooDepositCommandService({
    parcelResolver: googleSheetsCooDepositParcelResolver,
    eventSource,
    producer: new SupabaseLogisticsEventProducer(client),
    replayLookup: createReplayLookup(client),
  });
});

export async function POST(request: Request) {
  if (process.env.LOGISTICS_COO_DEPOSIT_ENABLED?.trim().toLowerCase() !== "true") {
    return Response.json(
      { error: { code: "WRITES_DISABLED", message: "Les dépôts logistiques ne sont pas activés." } },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
  return enabledHandler(request);
}

function createReplayLookup(client: LogisticsSupabaseClient) {
  return {
    async readEventById(eventId: string) {
      const result = await client.readLogisticsEvents({
        table: "logistics_events",
        columns: LOGISTICS_EVENT_COLUMNS,
        filter: { column: "id", operator: "eq", value: eventId },
        order: [
          { column: "parcel_id", ascending: true },
          { column: "version_after", ascending: true },
          { column: "occurred_at", ascending: true },
          { column: "id", ascending: true },
        ],
      });
      if (result.error !== null) throw new Error("Lecture de reprise impossible.");
      if (!result.data?.length) return null;
      return decodeLogisticsEventRows(result.data)[0] ?? null;
    },
  };
}
