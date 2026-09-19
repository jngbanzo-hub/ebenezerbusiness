import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { StockEvent } from "../../../../../local-preparation/contracts/stock-event";

import type { LogisticsEventSource } from "./logistics-event-source";
import { createLogisticsGetHandler } from "./logistics-get-handler";
import { findLocalParcelHistory } from "./local-logistics-source";
import { UnconfiguredSupabaseLogisticsEventSource } from "./supabase-logistics-source";

const request = (trackingCode: string) =>
  new Request(
    `http://localhost/api/agent/logistics?trackingCode=${encodeURIComponent(
      trackingCode,
    )}`,
  );

const validHistory = findLocalParcelHistory("LOCAL-LOG-001");
const invalidHistory = findLocalParcelHistory("LOCAL-INVALID-001");

if (validHistory === null || invalidHistory === null) {
  throw new Error("Fixtures logistiques locales absentes.");
}

test("la source logistique est injectable dans la route", async () => {
  const received: string[] = [];
  const source: LogisticsEventSource = {
    async readEventsByTrackingCode(trackingCode) {
      received.push(trackingCode);
      return validHistory;
    },
  };

  const response = await createLogisticsGetHandler(source)(
    request("local-log-001"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, ["LOCAL-LOG-001"]);
});

test("une source injectable peut signaler un colis introuvable", async () => {
  const source: LogisticsEventSource = {
    async readEventsByTrackingCode() {
      return null;
    },
  };
  const response = await createLogisticsGetHandler(source)(request("NONE-001"));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "PARCEL_NOT_FOUND");
});

test("une source injectable conserve le traitement des historiques invalides", async () => {
  const source: LogisticsEventSource = {
    async readEventsByTrackingCode(): Promise<readonly StockEvent[]> {
      return invalidHistory;
    },
  };
  const response = await createLogisticsGetHandler(source)(
    request("LOCAL-INVALID-001"),
  );
  assert.equal(response.status, 422);
  assert.equal(
    (await response.json()).error.code,
    "INVALID_LOGISTICS_HISTORY",
  );
});

test("l'adaptateur Supabase préparatoire retourne une erreur contrôlée", async () => {
  const source = new UnconfiguredSupabaseLogisticsEventSource();
  await assert.rejects(
    () => source.readEventsByTrackingCode("LOCAL-LOG-001"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "SOURCE_NOT_CONFIGURED",
  );

  const response = await createLogisticsGetHandler(source)(
    request("LOCAL-LOG-001"),
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "SOURCE_NOT_CONFIGURED");
});

test("l'injection ne modifie ni le format JSON ni les frontières métier", async () => {
  const source: LogisticsEventSource = {
    async readEventsByTrackingCode() {
      return validHistory;
    },
  };
  const before = JSON.stringify(validHistory);
  const body = await (
    await createLogisticsGetHandler(source)(request("LOCAL-LOG-001"))
  ).json();

  assert.deepEqual(Object.keys(body).sort(), [
    "activeArrivalAnomaly",
    "agentStatus",
    "currentAgency",
    "deliveredAt",
    "destinationCourante",
    "destinationInitiale",
    "locationState",
    "trackingCode",
    "transitFrom",
    "transitTo",
    "updatedAt",
    "version",
  ]);
  assert.equal("amount" in body, false);
  assert.equal("currency" in body, false);
  assert.equal("paymentStatus" in body, false);
  assert.equal(JSON.stringify(validHistory), before);
});

test("l'adaptateur préparatoire ne contient ni réseau, ni client, ni configuration", () => {
  const source = readFileSync(
    new URL("./supabase-logistics-source.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /from ["']@supabase\//i);
  assert.doesNotMatch(source, /\bfetch\s*\(/i);
  assert.doesNotMatch(source, /process\.env/i);
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\s*\(/i);
});
