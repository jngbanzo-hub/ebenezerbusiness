import assert from "node:assert/strict";
import test from "node:test";

import { createStockEvent, type StockEvent } from "../../../../../local-preparation/contracts/stock-event";

import {
  CooDepositCommandService,
  CooDepositError,
  type AuthoritativeParcel,
} from "./coo-deposit-command";
import { LogisticsEventProducerError } from "./logistics-event-producer";

const parcel: AuthoritativeParcel = Object.freeze({
  parcelId: "parcel-authoritative-001",
  trackingCode: "COO-NEW-001",
  destination: "FIH",
  weightKg: 2.5,
  sourceId: "tracking-source-001",
});
const actor = { userId: "agent-coo-001", site: "COO" as const };
const input = {
  trackingCode: " coo-new-001 ",
  requestId: "deposit-request-001",
  confirmationPhysicalDeposit: true as const,
  evidenceReference: "receipt-001",
};

function harness(options: {
  history?: readonly StockEvent[] | null;
  replay?: StockEvent | null;
  duplicate?: boolean;
} = {}) {
  const writes: StockEvent[] = [];
  const service = new CooDepositCommandService({
    parcelResolver: { async resolveByTrackingCode() { return parcel; } },
    eventSource: {
      async readEventsByTrackingCode() { return options.history ?? null; },
    },
    replayLookup: {
      async readEventById() { return options.replay ?? null; },
    },
    producer: {
      async appendEvent(_history, event) {
        if (options.duplicate) {
          throw new LogisticsEventProducerError("DUPLICATE_EVENT", "duplicate");
        }
        writes.push(event);
        return {} as never;
      },
    },
    now: () => new Date("2026-08-01T10:00:00.000Z"),
  });
  return { service, writes };
}

test("crée uniquement ENTREE_COO avec les autorités calculées côté serveur", async () => {
  const { service, writes } = harness();
  const result = await service.execute(input, actor);

  assert.equal(result.replayed, false);
  assert.equal(writes.length, 1);
  const event = writes[0];
  assert.equal(event.eventType, "ENTREE_COO");
  assert.equal(event.parcelId, parcel.parcelId);
  assert.equal(event.agency, "COO");
  assert.equal(event.fromAgency, null);
  assert.equal(event.toAgency, "COO");
  assert.equal(event.recordedBy, actor.userId);
  assert.equal(event.versionBefore, 0);
  assert.equal(event.versionAfter, 1);
  assert.equal(event.metadata.destinationInitiale, "FIH");
  assert.equal("agency_scope" in event, false);
});

test("génère un eventId déterministe pour le même acteur et requestId", async () => {
  const first = harness();
  const second = harness();
  await first.service.execute(input, actor);
  await second.service.execute(input, actor);
  assert.equal(first.writes[0].eventId, second.writes[0].eventId);
});

test("refuse un agent hors COO", async () => {
  await assert.rejects(
    () => harness().service.execute(input, { ...actor, site: "FIH" }),
    isCode("FORBIDDEN"),
  );
});

test("refuse une confirmation physique absente", async () => {
  await assert.rejects(
    () => harness().service.execute({ ...input, confirmationPhysicalDeposit: false }, actor),
    isCode("INVALID_COMMAND"),
  );
});

test("refuse un requestId absent", async () => {
  const { requestId: _requestId, ...withoutRequestId } = input;
  await assert.rejects(
    () => harness().service.execute(withoutRequestId, actor),
    isCode("INVALID_COMMAND"),
  );
});

test("refuse tous les champs d'autorité reçus du navigateur", async () => {
  for (const forbidden of ["eventId", "version", "versionBefore", "versionAfter", "agency_scope", "agency"]) {
    await assert.rejects(
      () => harness().service.execute({ ...input, [forbidden]: "forbidden" }, actor),
      isCode("INVALID_COMMAND"),
    );
  }
});

test("refuse un colis introuvable", async () => {
  const unavailable = new CooDepositCommandService({
    parcelResolver: { async resolveByTrackingCode() { return null; } },
    eventSource: { async readEventsByTrackingCode() { return null; } },
    replayLookup: { async readEventById() { return null; } },
    producer: { async appendEvent() { return {} as never; } },
  });
  await assert.rejects(() => unavailable.execute(input, actor), isCode("PARCEL_NOT_FOUND"));
});

test("refuse un colis déjà initialisé par une autre commande", async () => {
  await assert.rejects(
    () => harness({ history: [existingEvent("another-event", "another-fingerprint")] }).service.execute(input, actor),
    isCode("PARCEL_ALREADY_INITIALIZED"),
  );
});

test("rejoue avec succès la même commande", async () => {
  const first = harness();
  await first.service.execute(input, actor);
  const written = first.writes[0];
  const replay = await harness({ history: [written] }).service.execute(input, actor);
  assert.equal(replay.replayed, true);
  assert.equal(replay.eventId, written.eventId);
});

test("retourne un conflit si le même requestId porte un contenu différent", async () => {
  const first = harness();
  await first.service.execute(input, actor);
  await assert.rejects(
    () => harness({ history: [first.writes[0]] }).service.execute({ ...input, evidenceReference: "other-proof" }, actor),
    isCode("IDEMPOTENCY_CONFLICT"),
  );
});

test("résout une course d'insertion en replay idempotent", async () => {
  const first = harness();
  await first.service.execute(input, actor);
  const result = await harness({ duplicate: true, replay: first.writes[0] }).service.execute(input, actor);
  assert.equal(result.replayed, true);
});

function existingEvent(eventId: string, fingerprint: string): StockEvent {
  return createStockEvent({
    eventId,
    parcelId: parcel.parcelId,
    trackingCode: parcel.trackingCode,
    eventType: "ENTREE_COO",
    agency: "COO",
    fromAgency: null,
    toAgency: "COO",
    weightKg: parcel.weightKg,
    sourceType: "AGENT",
    sourceId: parcel.sourceId,
    occurredAt: "2026-08-01T10:00:00.000Z",
    recordedAt: "2026-08-01T10:00:00.000Z",
    recordedBy: actor.userId,
    requestId: input.requestId,
    reason: null,
    metadata: { destinationInitiale: parcel.destination, commandFingerprint: fingerprint },
    compensatesEventId: null,
    arrivalMismatch: null,
    versionBefore: 0,
    versionAfter: 1,
  });
}

function isCode(code: string) {
  return (error: unknown) => error instanceof CooDepositError && error.code === code;
}
