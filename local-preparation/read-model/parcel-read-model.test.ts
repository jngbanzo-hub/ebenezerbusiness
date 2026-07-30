import assert from "node:assert/strict";
import test from "node:test";

import {
  createStockEvent,
  type StockEvent,
  type StockEventInput,
} from "../contracts/stock-event";
import { LogisticsEngineError } from "../logistics-engine/logistics-engine";
import {
  buildParcelReadModel,
  buildParcelReadModels,
  formatAgentLocationLabel,
} from "./parcel-read-model";

const timestamp = (minute: number) =>
  `2026-07-31T14:${String(minute).padStart(2, "0")}:00.000Z`;

type ParcelFixture = Readonly<{
  parcelId: string;
  trackingCode: string;
  destination: "FIH" | "LSHI";
}>;

const primary: ParcelFixture = {
  parcelId: "parcel-read-001",
  trackingCode: "MR-READ-001",
  destination: "FIH",
};

function event(
  fixture: ParcelFixture,
  versionBefore: number,
  eventType: StockEventInput["eventType"],
  overrides: Partial<StockEventInput> = {},
): StockEvent {
  const variants: Partial<Record<StockEventInput["eventType"], Partial<StockEventInput>>> = {
    ENTREE_COO: {
      agency: "COO",
      fromAgency: null,
      toAgency: "COO",
      sourceType: "MANIFEST_OBSERVATION",
    },
    SORTIE_COO: {
      agency: "COO",
      fromAgency: "COO",
      toAgency: fixture.destination,
      sourceType: "MANIFEST_OBSERVATION",
    },
    ENTREE_DESTINATION: {
      agency: fixture.destination,
      fromAgency: "COO",
      toAgency: fixture.destination,
      sourceType: "MANIFEST_OBSERVATION",
    },
    ARRIVAL_MISMATCH_CONFIRMED: {
      agency: "LSHI",
      fromAgency: "COO",
      toAgency: "LSHI",
      sourceType: "AGENT",
      recordedBy: "agent-lshi-001",
      reason: "Arrivée physique inattendue à LSHI",
      arrivalMismatch: {
        expectedAgency: "FIH",
        actualAgency: "LSHI",
        confirmedByAgentId: "agent-lshi-001",
        confirmedByAgentAgency: "LSHI",
        physicalReceiptConfirmed: true,
        evidenceReference: "observation-read-001",
      },
    },
    SORTIE_REACHEMINEMENT: {
      agency: "LSHI",
      fromAgency: "LSHI",
      toAgency: "FIH",
      sourceType: "REROUTING",
    },
    ENTREE_REACHEMINEMENT: {
      agency: "FIH",
      fromAgency: "LSHI",
      toAgency: "FIH",
      sourceType: "REROUTING",
    },
    SORTIE_LIVRAISON: {
      agency: "FIH",
      fromAgency: "FIH",
      toAgency: null,
      sourceType: "DELIVERY_CONFIRMATION",
    },
  };
  return createStockEvent({
    eventId: `${fixture.parcelId}-event-${versionBefore + 1}`,
    parcelId: fixture.parcelId,
    trackingCode: fixture.trackingCode,
    eventType,
    agency: "COO",
    fromAgency: null,
    toAgency: "COO",
    weightKg: 2,
    sourceType: "MANIFEST_OBSERVATION",
    sourceId: `${fixture.parcelId}-source-${versionBefore + 1}`,
    occurredAt: timestamp(versionBefore + 1),
    recordedAt: timestamp(versionBefore + 1),
    recordedBy: "agent-001",
    requestId: `${fixture.parcelId}-request-${versionBefore + 1}`,
    reason: null,
    metadata:
      versionBefore === 0
        ? { destinationInitiale: fixture.destination }
        : {},
    compensatesEventId: null,
    arrivalMismatch: null,
    versionBefore,
    versionAfter: versionBefore + 1,
    ...variants[eventType],
    ...overrides,
  });
}

const cooHistory = (fixture = primary) => [
  event(fixture, 0, "ENTREE_COO"),
];
const transitHistory = (fixture = primary) => [
  ...cooHistory(fixture),
  event(fixture, 1, "SORTIE_COO"),
];
const arrivedHistory = (fixture = primary) => [
  ...transitHistory(fixture),
  event(fixture, 2, "ENTREE_DESTINATION"),
];
const mismatchHistory = () => [
  ...transitHistory(),
  event(primary, 2, "ARRIVAL_MISMATCH_CONFIRMED"),
];
const reroutedHistory = () => [
  ...mismatchHistory(),
  event(primary, 3, "SORTIE_REACHEMINEMENT"),
];
const deliveredHistory = () => [
  ...reroutedHistory(),
  event(primary, 4, "ENTREE_REACHEMINEMENT"),
  event(primary, 5, "SORTIE_LIVRAISON"),
];

test("construit la vue d'un colis à COO", () => {
  const model = buildParcelReadModel(cooHistory());
  assert.equal(model.currentAgency, "COO");
  assert.equal(model.agentStatus, "EN_ATTENTE");
  assert.equal(formatAgentLocationLabel(model), "En attente à COO");
});

test("construit la vue d'un colis en transit", () => {
  const model = buildParcelReadModel(transitHistory());
  assert.equal(model.agentStatus, "EN_TRANSIT");
  assert.equal(model.transitFrom, "COO");
  assert.equal(model.transitTo, "FIH");
  assert.equal(formatAgentLocationLabel(model), "En transit de COO vers FIH");
});

test("construit la vue d'un colis arrivé à FIH", () => {
  const model = buildParcelReadModel(arrivedHistory());
  assert.equal(model.agentStatus, "EN_AGENCE");
  assert.equal(model.currentAgency, "FIH");
  assert.equal(formatAgentLocationLabel(model), "En agence à FIH");
});

test("rend visible une arrivée erronée à LSHI", () => {
  const model = buildParcelReadModel(mismatchHistory());
  assert.equal(model.currentAgency, "LSHI");
  assert.equal(model.activeArrivalAnomaly?.expectedAgency, "FIH");
  assert.equal(model.activeArrivalAnomaly?.actualAgency, "LSHI");
  assert.equal(
    formatAgentLocationLabel(model),
    "Arrivée inattendue à LSHI (attendue : FIH)",
  );
});

test("ferme l'anomalie après réacheminement explicite", () => {
  const model = buildParcelReadModel(reroutedHistory());
  assert.equal(model.activeArrivalAnomaly, null);
  assert.equal(model.agentStatus, "EN_TRANSIT");
});

test("expose un colis livré et deliveredAt", () => {
  const history = deliveredHistory();
  const model = buildParcelReadModel(history);
  assert.equal(model.agentStatus, "LIVRE");
  assert.equal(model.deliveredAt, history.at(-1)?.occurredAt);
  assert.equal(formatAgentLocationLabel(model), "Livré");
});

test("refuse un historique invalide sans inventer de position", () => {
  const history = transitHistory();
  const invalid = [
    history[0],
    { ...history[1], versionBefore: 8, versionAfter: 9 },
  ];
  assert.throws(
    () => buildParcelReadModel(invalid),
    (error) =>
      error instanceof LogisticsEngineError &&
      error.code === "VERSION_CONFLICT",
  );
});

test("reconstruit plusieurs colis indépendamment", () => {
  const secondary: ParcelFixture = {
    parcelId: "parcel-read-002",
    trackingCode: "MR-READ-002",
    destination: "LSHI",
  };
  const models = buildParcelReadModels({
    [primary.parcelId]: arrivedHistory(),
    [secondary.parcelId]: transitHistory(secondary),
  });
  assert.equal(models[primary.parcelId].currentAgency, "FIH");
  assert.equal(models[secondary.parcelId].transitTo, "LSHI");
});

test("ne contient aucun effet ou statut financier", () => {
  const model = buildParcelReadModel(deliveredHistory());
  assert.equal("paymentStatus" in model, false);
  assert.equal("amount" in model, false);
  assert.equal("fee" in model, false);
});

test("retourne un modèle profondément immutable sans muter l'historique", () => {
  const history = mismatchHistory();
  const before = JSON.stringify(history);
  const model = buildParcelReadModel(history);
  assert.equal(JSON.stringify(history), before);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.activeArrivalAnomaly), true);
});
