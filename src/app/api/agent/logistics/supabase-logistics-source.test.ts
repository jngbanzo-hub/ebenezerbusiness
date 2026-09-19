import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { StockEvent } from "../../../../../local-preparation/contracts/stock-event";

import {
  LogisticsEventSourceError,
} from "./logistics-event-source";
import {
  LogisticsEventRowError,
  stockEventToLogisticsEventRow,
  type LogisticsEventRow,
} from "./logistics-event-row";
import {
  type LogisticsSupabaseClient,
  type LogisticsSupabaseReadRequest,
  type LogisticsSupabaseReadResult,
} from "./logistics-supabase-client";
import { findLocalParcelHistory } from "./local-logistics-source";
import { GET } from "./route";
import {
  SupabaseLogisticsEventSource,
  UnconfiguredSupabaseLogisticsEventSource,
} from "./supabase-logistics-source";

class FakeLogisticsSupabaseClient implements LogisticsSupabaseClient {
  readonly calls: LogisticsSupabaseReadRequest[] = [];

  constructor(private readonly result: LogisticsSupabaseReadResult) {}

  async readLogisticsEvents(
    request: LogisticsSupabaseReadRequest,
  ): Promise<LogisticsSupabaseReadResult> {
    this.calls.push(structuredClone(request));
    return this.result;
  }
}

const localHistory = findLocalParcelHistory("LOCAL-LOG-001");
if (localHistory === null) {
  throw new Error("Fixture logistique locale absente.");
}
const rows = localHistory.map(stockEventToLogisticsEventRow);

function clientWith(
  data: readonly LogisticsEventRow[] | null,
  error: LogisticsSupabaseReadResult["error"] = null,
) {
  return new FakeLogisticsSupabaseClient({ data, error });
}

test("lit et convertit un colis en StockEvent", async () => {
  const source = new SupabaseLogisticsEventSource(clientWith(rows));
  const events = await source.readEventsByTrackingCode("LOCAL-LOG-001");
  assert.notEqual(events, null);
  assert.deepEqual(
    events?.map((event) => event.eventId),
    localHistory.map((event) => event.eventId),
  );
  assert.equal(Object.isFrozen(events), true);
});

test("cible uniquement logistics_events avec le filtre tracking_code", async () => {
  const client = clientWith(rows);
  await new SupabaseLogisticsEventSource(client).readEventsByTrackingCode(
    "LOCAL-LOG-001",
  );

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].table, "logistics_events");
  assert.deepEqual(client.calls[0].filter, {
    column: "tracking_code",
    operator: "eq",
    value: "LOCAL-LOG-001",
  });
});

test("demande et garantit un ordre déterministe", async () => {
  const client = clientWith([...rows].reverse());
  const events = await new SupabaseLogisticsEventSource(
    client,
  ).readEventsByTrackingCode("LOCAL-LOG-001");

  assert.deepEqual(client.calls[0].order, [
    { column: "parcel_id", ascending: true },
    { column: "version_after", ascending: true },
    { column: "occurred_at", ascending: true },
    { column: "id", ascending: true },
  ]);
  assert.deepEqual(
    events?.map((event) => event.versionAfter),
    [1, 2, 3],
  );
});

test("retourne null lorsque le client ne retourne aucune donnée", async () => {
  const empty = await new SupabaseLogisticsEventSource(
    clientWith([]),
  ).readEventsByTrackingCode("EMPTY-001");
  const absent = await new SupabaseLogisticsEventSource(
    clientWith(null),
  ).readEventsByTrackingCode("EMPTY-001");
  assert.equal(empty, null);
  assert.equal(absent, null);
});

test("traduit une erreur client en erreur de lecture contrôlée", async () => {
  const source = new SupabaseLogisticsEventSource(
    clientWith(null, { message: "internal fake failure" }),
  );
  await assert.rejects(
    () => source.readEventsByTrackingCode("LOCAL-LOG-001"),
    (error: unknown) =>
      error instanceof LogisticsEventSourceError &&
      error.code === "SOURCE_READ_FAILED" &&
      !error.message.includes("internal fake failure"),
  );
});

test("rejette une ligne corrompue", async () => {
  const corrupted = {
    ...rows[0],
    version_after: 9,
  } as LogisticsEventRow;
  const source = new SupabaseLogisticsEventSource(clientWith([corrupted]));
  await assert.rejects(
    () => source.readEventsByTrackingCode("LOCAL-LOG-001"),
    LogisticsEventRowError,
  );
});

test("le faux client est local, lisible et ne propose aucune écriture", async () => {
  const client = clientWith(rows);
  const before = JSON.stringify(rows);
  await new SupabaseLogisticsEventSource(client).readEventsByTrackingCode(
    "LOCAL-LOG-001",
  );
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(Object.keys(client).sort(), ["calls", "result"]);
  assert.equal("insert" in client, false);
  assert.equal("update" in client, false);
  assert.equal("delete" in client, false);
});

test("la source non configurée conserve SOURCE_NOT_CONFIGURED", async () => {
  await assert.rejects(
    () =>
      new UnconfiguredSupabaseLogisticsEventSource().readEventsByTrackingCode(
        "LOCAL-LOG-001",
      ),
    (error: unknown) =>
      error instanceof LogisticsEventSourceError &&
      error.code === "SOURCE_NOT_CONFIGURED",
  );
});

test("la route publique utilise toujours la source locale par défaut", async () => {
  const response = await GET(
    new Request(
      "http://localhost/api/agent/logistics?trackingCode=LOCAL-LOG-001",
    ),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.trackingCode, "LOCAL-LOG-001");
  assert.equal(body.currentAgency, "LSHI");
});

test("aucun champ financier n'est lu ou retourné", async () => {
  const client = clientWith(rows);
  const events = (await new SupabaseLogisticsEventSource(
    client,
  ).readEventsByTrackingCode("LOCAL-LOG-001")) as readonly StockEvent[];
  assert.equal(client.calls[0].columns.includes("payload"), true);
  assert.equal("amount" in client.calls[0], false);
  assert.equal("currency" in client.calls[0], false);
  assert.equal("payment" in events[0], false);
});

test("l'adaptateur ne contient ni SDK, ni environnement, ni réseau, ni écriture", () => {
  const files = [
    "./logistics-supabase-client.ts",
    "./supabase-logistics-source.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  const source = files.join("\n");
  assert.doesNotMatch(source, /from ["']@supabase\//i);
  assert.doesNotMatch(source, /process\.env/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/i);
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\s*\(/i);
});
