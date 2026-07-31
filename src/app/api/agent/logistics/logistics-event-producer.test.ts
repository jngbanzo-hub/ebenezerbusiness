import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createStockEvent,
  type StockEvent,
  type StockEventInput,
} from "../../../../../local-preparation/contracts/stock-event";

import {
  LogisticsEventProducerError,
  SupabaseLogisticsEventProducer,
} from "./logistics-event-producer";
import type {
  LogisticsSupabaseInsertRequest,
  LogisticsSupabaseInsertResult,
  LogisticsSupabaseWriteClient,
} from "./logistics-supabase-client";

class FakeWriteClient implements LogisticsSupabaseWriteClient {
  readonly calls: LogisticsSupabaseInsertRequest[] = [];

  constructor(
    private readonly result: LogisticsSupabaseInsertResult | null = null,
  ) {}

  async insertLogisticsEvent(
    request: LogisticsSupabaseInsertRequest,
  ): Promise<LogisticsSupabaseInsertResult> {
    this.calls.push(structuredClone(request));
    return (
      this.result ?? {
        data: { id: request.row.id },
        error: null,
      }
    );
  }
}

function event(
  eventType: StockEventInput["eventType"] = "ENTREE_COO",
  overrides: Partial<StockEventInput> = {},
): StockEvent {
  const variants: Partial<
    Record<StockEventInput["eventType"], Partial<StockEventInput>>
  > = {
    ENTREE_COO: {
      agency: "COTONOU",
      fromAgency: null,
      toAgency: "COTONOU",
    },
    SORTIE_COO: {
      agency: "COO",
      fromAgency: "COO",
      toAgency: "FIH",
    },
  };

  return createStockEvent({
    eventId: "producer-event-001",
    parcelId: "producer-parcel-001",
    trackingCode: "PRODUCER-001",
    eventType,
    agency: "COO",
    fromAgency: null,
    toAgency: "COO",
    weightKg: 2,
    sourceType: "SYSTEM",
    sourceId: "producer-source-001",
    requestId: null,
    occurredAt: "2026-07-31T19:00:00.000Z",
    recordedAt: "2026-07-31T19:00:01.000Z",
    recordedBy: null,
    reason: null,
    metadata: { destinationInitiale: "FIH" },
    compensatesEventId: null,
    arrivalMismatch: null,
    versionBefore: 0,
    versionAfter: 1,
    ...variants[eventType],
    ...overrides,
  });
}

test("insère un événement valide dans logistics_events", async () => {
  const client = new FakeWriteClient();
  const row = await new SupabaseLogisticsEventProducer(client).appendEvent(
    [],
    event(),
  );

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].table, "logistics_events");
  assert.equal(client.calls[0].row.id, "producer-event-001");
  assert.deepEqual(row.agency_scope, ["COO", "FIH"]);
  assert.equal(Object.isFrozen(row), true);
  assert.equal(Object.isFrozen(row.agency_scope), true);
});

test("calcule la portée depuis le circuit validé et normalise COTONOU", async () => {
  const client = new FakeWriteClient();
  const first = event();
  const second = event("SORTIE_COO", {
    eventId: "producer-event-002",
    sourceId: "producer-source-002",
    occurredAt: "2026-07-31T19:01:00.000Z",
    recordedAt: "2026-07-31T19:01:01.000Z",
    versionBefore: 1,
    versionAfter: 2,
    metadata: {},
  });

  const row = await new SupabaseLogisticsEventProducer(client).appendEvent(
    [first],
    second,
  );

  assert.deepEqual(row.agency_scope, ["COO", "FIH"]);
  assert.equal(row.agency_scope.includes("COTONOU" as "COO"), false);
  assert.equal("agency_scope" in second, false);
});

test("refuse proprement un event_id ou une version déjà présents", async () => {
  const client = new FakeWriteClient();
  const producer = new SupabaseLogisticsEventProducer(client);
  await assert.rejects(
    () => producer.appendEvent([event()], event()),
    (error: unknown) =>
      error instanceof LogisticsEventProducerError &&
      error.code === "DUPLICATE_EVENT",
  );
  assert.equal(client.calls.length, 0);
});

test("traduit un conflit unique Supabase en doublon contrôlé", async () => {
  const client = new FakeWriteClient({
    data: null,
    error: { code: "23505", message: "sensitive database detail" },
  });
  await assert.rejects(
    () => new SupabaseLogisticsEventProducer(client).appendEvent([], event()),
    (error: unknown) =>
      error instanceof LogisticsEventProducerError &&
      error.code === "DUPLICATE_EVENT" &&
      !error.message.includes("sensitive"),
  );
});

test("refuse une agence hors du contrat canonique avant toute écriture", async () => {
  const client = new FakeWriteClient();
  const invalid = {
    ...event(),
    agency: "PARIS",
  } as unknown as StockEvent;
  await assert.rejects(
    () => new SupabaseLogisticsEventProducer(client).appendEvent([], invalid),
    (error: unknown) =>
      error instanceof LogisticsEventProducerError &&
      error.code === "INVALID_EVENT",
  );
  assert.equal(client.calls.length, 0);
});

test("ne contient aucun domaine financier", async () => {
  const row = await new SupabaseLogisticsEventProducer(
    new FakeWriteClient(),
  ).appendEvent([], event());
  assert.equal("amount" in row, false);
  assert.equal("currency" in row, false);
  assert.equal("payment" in row, false);
});

test("garde la clé service_role exclusivement dans un module serveur", () => {
  const serverSource = readFileSync(
    new URL("../../../../server/logistics-supabase-service-client.ts", import.meta.url),
    "utf8",
  );
  const publicFiles = [
    "./logistics-event-producer.ts",
    "./logistics-supabase-client.ts",
    "./route.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  assert.match(serverSource, /^import "server-only";/);
  assert.match(serverSource, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(serverSource, /NEXT_PUBLIC_SUPABASE_SERVICE/i);
  assert.doesNotMatch(publicFiles.join("\n"), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(publicFiles.join("\n"), /\.(insert|upsert)\s*\(/i);
});
