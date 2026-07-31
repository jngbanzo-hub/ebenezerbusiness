import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STOCK_EVENT_TYPES,
  createStockEvent,
  type StockEvent,
  type StockEventInput,
} from "../../../../../local-preparation/contracts/stock-event";

import {
  LogisticsEventRowError,
  decodeLogisticsEventRows,
  logisticsEventRowToStockEvent,
  stockEventToLogisticsEventRow,
  type LogisticsEventRow,
} from "./logistics-event-row";
import { UnconfiguredSupabaseLogisticsEventSource } from "./supabase-logistics-source";

function event(
  eventType: StockEventInput["eventType"] = "ENTREE_COO",
  overrides: Partial<StockEventInput> = {},
): StockEvent {
  const variants: Partial<
    Record<StockEventInput["eventType"], Partial<StockEventInput>>
  > = {
    ENTREE_COO: {
      agency: "COO",
      fromAgency: null,
      toAgency: "COO",
      sourceType: "SYSTEM",
    },
    SORTIE_COO: {
      agency: "COO",
      fromAgency: "COO",
      toAgency: "FIH",
      sourceType: "SYSTEM",
    },
    ENTREE_DESTINATION: {
      agency: "FIH",
      fromAgency: "COO",
      toAgency: "FIH",
      sourceType: "SYSTEM",
    },
    SORTIE_REACHEMINEMENT: {
      agency: "FIH",
      fromAgency: "FIH",
      toAgency: "LSHI",
      sourceType: "REROUTING",
    },
    ENTREE_REACHEMINEMENT: {
      agency: "LSHI",
      fromAgency: "FIH",
      toAgency: "LSHI",
      sourceType: "REROUTING",
    },
    ARRIVAL_MISMATCH_CONFIRMED: {
      agency: "LSHI",
      fromAgency: "COO",
      toAgency: "LSHI",
      sourceType: "AGENT",
      recordedBy: "agent-lshi-001",
      reason: "Arrivée physique inattendue",
      arrivalMismatch: {
        expectedAgency: "FIH",
        actualAgency: "LSHI",
        confirmedByAgentId: "agent-lshi-001",
        confirmedByAgentAgency: "LSHI",
        physicalReceiptConfirmed: true,
        evidenceReference: "physical-evidence-001",
      },
    },
    SORTIE_LIVRAISON: {
      agency: "FIH",
      fromAgency: "FIH",
      toAgency: null,
      sourceType: "DELIVERY_CONFIRMATION",
    },
    SORTIE_DESTINATION: {
      agency: "FIH",
      fromAgency: "FIH",
      toAgency: null,
      sourceType: "DELIVERY_CONFIRMATION",
    },
    AJUSTEMENT_ADMIN: {
      agency: "FIH",
      fromAgency: null,
      toAgency: null,
      sourceType: "ADMIN",
      reason: "Ajustement logistique contrôlé",
    },
    STOCK_REVERSAL: {
      agency: "FIH",
      fromAgency: null,
      toAgency: null,
      sourceType: "ADMIN",
      reason: "Compensation logistique contrôlée",
      compensatesEventId: "event-compensated-001",
    },
  };

  return createStockEvent({
    eventId: "event-row-001",
    parcelId: "parcel-row-001",
    trackingCode: "ROW-001",
    eventType,
    agency: "COO",
    fromAgency: null,
    toAgency: "COO",
    weightKg: 2,
    sourceType: "SYSTEM",
    sourceId: "source-row-001",
    requestId: "request-row-001",
    occurredAt: "2026-07-31T18:00:00.000Z",
    recordedAt: "2026-07-31T18:01:00.000Z",
    recordedBy: "agent-row-001",
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

function row(overrides: Partial<LogisticsEventRow> = {}): LogisticsEventRow {
  return { ...stockEventToLogisticsEventRow(event()), ...overrides };
}

function rowError(action: () => unknown) {
  assert.throws(
    action,
    (error) =>
      error instanceof LogisticsEventRowError &&
      error.code === "INVALID_LOGISTICS_EVENT_ROW",
  );
}

test("effectue un aller-retour événement vers ligne puis événement", () => {
  const source = event();
  const restored = logisticsEventRowToStockEvent(
    stockEventToLogisticsEventRow(source),
  );
  assert.deepEqual(restored, source);
});

test("convertit tous les types d'événements logistiques contractuels", () => {
  STOCK_EVENT_TYPES.forEach((eventType, index) => {
    const source = event(eventType, {
      eventId: `event-type-${index + 1}`,
      sourceId: `source-type-${index + 1}`,
      requestId: `request-type-${index + 1}`,
    });
    assert.deepEqual(
      logisticsEventRowToStockEvent(stockEventToLogisticsEventRow(source)),
      source,
    );
  });
});

test("rejette une ligne dont un champ requis est invalide", () => {
  rowError(() => logisticsEventRowToStockEvent(row({ parcel_id: "" })));
});

test("rejette des versions incohérentes", () => {
  rowError(() =>
    logisticsEventRowToStockEvent(
      row({ version_before: 3, version_after: 8 }),
    ),
  );
});

test("rejette une date invalide", () => {
  rowError(() =>
    logisticsEventRowToStockEvent(row({ occurred_at: "31/07/2026" })),
  );
});

test("rejette un type d'événement inconnu", () => {
  rowError(() =>
    logisticsEventRowToStockEvent(
      row({ event_type: "PAYMENT_RECORDED" as LogisticsEventRow["event_type"] }),
    ),
  );
});

test("décode les lignes dans un ordre déterministe", () => {
  const second = stockEventToLogisticsEventRow(
    event("SORTIE_COO", {
      eventId: "event-row-002",
      sourceId: "source-row-002",
      requestId: "request-row-002",
      occurredAt: "2026-07-31T18:02:00.000Z",
      recordedAt: "2026-07-31T18:03:00.000Z",
      versionBefore: 1,
      versionAfter: 2,
    }),
  );
  const first = stockEventToLogisticsEventRow(event());
  const decoded = decodeLogisticsEventRows([second, first]);
  assert.deepEqual(
    decoded.map((item) => item.eventId),
    ["event-row-001", "event-row-002"],
  );
});

test("ne mute pas les entrées et retourne des objets immutables", () => {
  const mutableRow = { ...row(), payload: structuredClone(row().payload) };
  const before = JSON.stringify(mutableRow);
  const decoded = decodeLogisticsEventRows([mutableRow]);
  assert.equal(JSON.stringify(mutableRow), before);
  assert.equal(Object.isFrozen(mutableRow), false);
  assert.equal(Object.isFrozen(decoded), true);
  assert.equal(Object.isFrozen(decoded[0]), true);
});

test("le schéma et la ligne ne contiennent aucun champ financier", () => {
  const sql = readFileSync(
    new URL(
      "../../../../../local-preparation/supabase/001_logistics_events.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const mapped = stockEventToLogisticsEventRow(event());
  assert.doesNotMatch(sql, /\b(amount|currency|payment|fee)\b/i);
  assert.equal("amount" in mapped, false);
  assert.equal("currency" in mapped, false);
  assert.equal("payment" in mapped, false);
});

test("l'adaptateur réutilise le décodeur mais reste non configuré et sans réseau", async () => {
  const adapter = new UnconfiguredSupabaseLogisticsEventSource();
  assert.equal(adapter.decodeRows([row()]).length, 1);
  await assert.rejects(
    () => adapter.readEventsByTrackingCode("ROW-001"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "SOURCE_NOT_CONFIGURED",
  );

  const source = readFileSync(
    new URL("./supabase-logistics-source.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /from ["']@supabase\//i);
  assert.doesNotMatch(source, /\bfetch\s*\(/i);
  assert.doesNotMatch(source, /process\.env/i);
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\s*\(/i);
});
