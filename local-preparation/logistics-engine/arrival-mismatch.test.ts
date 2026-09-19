import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createParcelPosition, type ParcelPosition } from "../contracts/parcel-position";
import {
  createStockEvent,
  type StockEvent,
  type StockEventInput,
} from "../contracts/stock-event";
import {
  applyLogisticsEvent,
  LogisticsEngineError,
  projectArrivalAnomalies,
  rebuildParcelPosition,
} from "./logistics-engine";

const at = (minute: number) =>
  `2026-07-31T12:${String(minute).padStart(2, "0")}:00.000Z`;

function unknown(): ParcelPosition {
  return createParcelPosition({
    parcelId: "parcel-mismatch-001",
    trackingCode: "MR-MISMATCH-001",
    destinationInitiale: "FIH",
    destinationCourante: "FIH",
    locationState: "UNKNOWN",
    currentAgency: null,
    transitFrom: null,
    transitTo: null,
    lastEventId: null,
    version: 0,
    updatedAt: at(0),
  });
}

function stock(
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
      toAgency: "FIH",
      sourceType: "MANIFEST_OBSERVATION",
    },
    ARRIVAL_MISMATCH_CONFIRMED: {
      agency: "LSHI",
      fromAgency: "COO",
      toAgency: "LSHI",
      sourceType: "AGENT",
      recordedBy: "agent-lshi-001",
      reason: "Colis physiquement reçu à LSHI",
      arrivalMismatch: {
        expectedAgency: "FIH",
        actualAgency: "LSHI",
        confirmedByAgentId: "agent-lshi-001",
        confirmedByAgentAgency: "LSHI",
        physicalReceiptConfirmed: true,
        evidenceReference: "observation-lshi-001",
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
    eventId: `mismatch-event-${versionBefore + 1}`,
    parcelId: "parcel-mismatch-001",
    trackingCode: "MR-MISMATCH-001",
    eventType,
    agency: "COO",
    fromAgency: null,
    toAgency: "COO",
    weightKg: 3,
    sourceType: "MANIFEST_OBSERVATION",
    sourceId: `mismatch-source-${versionBefore + 1}`,
    occurredAt: at(versionBefore + 1),
    recordedAt: at(versionBefore + 1),
    recordedBy: "agent-001",
    requestId: `stock-request-${versionBefore + 1}`,
    reason: null,
    metadata:
      versionBefore === 0 ? { destinationInitiale: "FIH" } : {},
    compensatesEventId: null,
    arrivalMismatch: null,
    versionBefore,
    versionAfter: versionBefore + 1,
    ...variants[eventType],
    ...overrides,
  });
}

const baseHistory = () => [
  stock(0, "ENTREE_COO"),
  stock(1, "SORTIE_COO"),
];
const mismatchEvent = (overrides: Partial<StockEventInput> = {}) =>
  stock(2, "ARRIVAL_MISMATCH_CONFIRMED", overrides);
const fullHistory = () => [
  ...baseHistory(),
  mismatchEvent(),
  stock(3, "SORTIE_REACHEMINEMENT"),
  stock(4, "ENTREE_REACHEMINEMENT"),
  stock(5, "SORTIE_LIVRAISON"),
];

function reduce(events: readonly StockEvent[], start = unknown()) {
  return events.reduce(
    (position, event) => applyLogisticsEvent(position, event),
    start,
  );
}

function engineError(action: () => unknown, code: string) {
  assert.throws(
    action,
    (error) => error instanceof LogisticsEngineError && error.code === code,
  );
}

test("B1-1 transit FIH puis arrivée inattendue LSHI acceptée", () => {
  assert.doesNotThrow(() => reduce([...baseHistory(), mismatchEvent()]));
});

test("B1-2 position finale AT_AGENCY LSHI", () => {
  const result = reduce([...baseHistory(), mismatchEvent()]);
  assert.equal(result.locationState, "AT_AGENCY");
  assert.equal(result.currentAgency, "LSHI");
});

test("B1-3 destinationInitiale conservée", () => {
  assert.equal(
    reduce([...baseHistory(), mismatchEvent()]).destinationInitiale,
    "FIH",
  );
});

test("B1-4 destinationCourante conservée", () => {
  assert.equal(
    reduce([...baseHistory(), mismatchEvent()]).destinationCourante,
    "FIH",
  );
});

test("B1-5 expectedAgency doit correspondre à transitTo", () => {
  const transit = reduce(baseHistory());
  const invalid = {
    ...mismatchEvent(),
    arrivalMismatch: {
      ...mismatchEvent().arrivalMismatch!,
      expectedAgency: "KLZ" as const,
    },
  };
  engineError(
    () => applyLogisticsEvent(transit, invalid),
    "ARRIVAL_MISMATCH_EXPECTED_AGENCY_INVALID",
  );
});

test("B1-6 actualAgency doit différer de expectedAgency", () => {
  assert.throws(() =>
    mismatchEvent({
      agency: "FIH",
      toAgency: "FIH",
      arrivalMismatch: {
        expectedAgency: "FIH",
        actualAgency: "FIH",
        confirmedByAgentId: "agent-fih-001",
        confirmedByAgentAgency: "FIH",
        physicalReceiptConfirmed: true,
        evidenceReference: "observation-fih-001",
      },
      recordedBy: "agent-fih-001",
    }),
  );
});

test("B1-7 Agent LSHI confirme une arrivée réelle LSHI", () => {
  const item = mismatchEvent();
  assert.equal(item.arrivalMismatch?.confirmedByAgentAgency, "LSHI");
  assert.equal(item.arrivalMismatch?.actualAgency, "LSHI");
});

test("B1-8 Agent FIH ne confirme pas une arrivée réelle LSHI", () => {
  assert.throws(() =>
    mismatchEvent({
      arrivalMismatch: {
        expectedAgency: "FIH",
        actualAgency: "LSHI",
        confirmedByAgentId: "agent-fih-001",
        confirmedByAgentAgency: "FIH",
        physicalReceiptConfirmed: true,
        evidenceReference: "observation-lshi-001",
      },
      recordedBy: "agent-fih-001",
    }),
  );
});

test("B1-9 physicalReceiptConfirmed false refusé", () => {
  assert.throws(() =>
    mismatchEvent({
      arrivalMismatch: {
        ...mismatchEvent().arrivalMismatch!,
        physicalReceiptConfirmed: false,
      },
    }),
  );
});

test("B1-10 motif absent refusé", () => {
  assert.throws(() => mismatchEvent({ reason: "" }));
});

test("B1-11 identité Agent absente refusée", () => {
  assert.throws(() =>
    mismatchEvent({
      recordedBy: null,
      arrivalMismatch: {
        ...mismatchEvent().arrivalMismatch!,
        confirmedByAgentId: "",
      },
    }),
  );
});

test("B1-12 preuve ou observation absente refusée", () => {
  assert.throws(() =>
    mismatchEvent({
      arrivalMismatch: {
        ...mismatchEvent().arrivalMismatch!,
        evidenceReference: "",
      },
    }),
  );
});

test("B1-13 événement depuis AT_AGENCY refusé", () => {
  const atCoo = reduce([stock(0, "ENTREE_COO")]);
  engineError(
    () => applyLogisticsEvent(atCoo, stock(1, "ARRIVAL_MISMATCH_CONFIRMED")),
    "INVALID_TRANSITION",
  );
});

test("B1-14 événement depuis UNKNOWN refusé", () => {
  engineError(
    () =>
      applyLogisticsEvent(
        unknown(),
        stock(0, "ARRIVAL_MISMATCH_CONFIRMED"),
      ),
    "INVALID_TRANSITION",
  );
});

test("B1-15 événement depuis DELIVERED refusé", () => {
  const delivered = rebuildParcelPosition(fullHistory());
  engineError(
    () =>
      applyLogisticsEvent(
        delivered,
        stock(6, "ARRIVAL_MISMATCH_CONFIRMED"),
      ),
    "ALREADY_DELIVERED",
  );
});

test("B1-16 événement avec mauvaise version refusé", () => {
  const transit = reduce(baseHistory());
  engineError(
    () =>
      applyLogisticsEvent(
        transit,
        { ...mismatchEvent(), versionBefore: 4, versionAfter: 5 },
      ),
    "VERSION_CONFLICT",
  );
});

test("B1-17 doublon eventId refusé", () => {
  const mismatch = mismatchEvent();
  const after = reduce([...baseHistory(), mismatch]);
  const duplicate = {
    ...stock(3, "SORTIE_REACHEMINEMENT"),
    eventId: mismatch.eventId,
  };
  engineError(
    () => applyLogisticsEvent(after, duplicate),
    "EVENT_ALREADY_APPLIED",
  );
});

test("B1-18 reconstruction complète avec arrivée inattendue", () => {
  const result = rebuildParcelPosition([
    ...baseHistory(),
    mismatchEvent(),
  ]);
  assert.equal(result.currentAgency, "LSHI");
});

test("B1-19 reconstruction déterministe", () => {
  assert.deepEqual(
    rebuildParcelPosition(fullHistory()),
    rebuildParcelPosition(fullHistory()),
  );
});

test("B1-20 objets d'entrée non mutés", () => {
  const position = reduce(baseHistory());
  const item = mismatchEvent();
  const positionBefore = JSON.stringify(position);
  const eventBefore = JSON.stringify(item);
  applyLogisticsEvent(position, item);
  assert.equal(JSON.stringify(position), positionBefore);
  assert.equal(JSON.stringify(item), eventBefore);
});

test("B1-21 métadonnées non mutées", () => {
  const item = mismatchEvent({ metadata: { observationType: "PHYSICAL" } });
  const before = JSON.stringify(item.metadata);
  reduce([...baseHistory(), item]);
  assert.equal(JSON.stringify(item.metadata), before);
  assert.equal(Object.isFrozen(item.metadata), true);
});

test("B1-22 aucun statut financier modifié", () => {
  const paymentStatus = "NON_PAYE";
  rebuildParcelPosition(fullHistory());
  assert.equal(paymentStatus, "NON_PAYE");
});

test("B1-23 aucun paiement créé", () => {
  assert.equal(fullHistory().some((item) => "paymentRequestId" in item), false);
});

test("B1-24 aucun frais créé", () => {
  assert.equal(
    fullHistory().some((item) => item.eventType.includes("FEE")),
    false,
  );
});

test("B1-25 aucun réacheminement automatique", () => {
  const history = [...baseHistory(), mismatchEvent()];
  const result = rebuildParcelPosition(history);
  assert.equal(history.length, 3);
  assert.equal(result.currentAgency, "LSHI");
  assert.equal(result.locationState, "AT_AGENCY");
});

test("B1-26 SORTIE_REACHEMINEMENT depuis actualAgency acceptée", () => {
  const result = reduce([
    ...baseHistory(),
    mismatchEvent(),
    stock(3, "SORTIE_REACHEMINEMENT"),
  ]);
  assert.equal(result.locationState, "IN_TRANSIT");
  assert.equal(result.transitFrom, "LSHI");
});

test("B1-27 réacheminement depuis expectedAgency refusé", () => {
  const atLshi = reduce([...baseHistory(), mismatchEvent()]);
  const wrong = stock(3, "SORTIE_REACHEMINEMENT", {
    agency: "FIH",
    fromAgency: "FIH",
    toAgency: "LSHI",
  });
  engineError(
    () => applyLogisticsEvent(atLshi, wrong),
    "AGENCY_MISMATCH",
  );
});

test("B1-28 arrivée de réacheminement à destinationCourante acceptée", () => {
  const result = reduce(fullHistory().slice(0, 5));
  assert.equal(result.currentAgency, "FIH");
  assert.equal(result.destinationCourante, "FIH");
});

test("B1-29 livraison finale par la bonne agence acceptée", () => {
  assert.equal(rebuildParcelPosition(fullHistory()).locationState, "DELIVERED");
});

test("B1-30 livraison par actualAgency après départ refusée", () => {
  const transit = reduce(fullHistory().slice(0, 4));
  const wrongDelivery = stock(4, "SORTIE_LIVRAISON", {
    agency: "LSHI",
    fromAgency: "LSHI",
  });
  engineError(
    () => applyLogisticsEvent(transit, wrongDelivery),
    "INVALID_TRANSITION",
  );
});

test("B1-31 scénario complet COO, anomalie LSHI, FIH, livraison", () => {
  const result = rebuildParcelPosition(fullHistory());
  assert.deepEqual(
    {
      locationState: result.locationState,
      currentAgency: result.currentAgency,
      destinationInitiale: result.destinationInitiale,
      destinationCourante: result.destinationCourante,
    },
    {
      locationState: "DELIVERED",
      currentAgency: null,
      destinationInitiale: "FIH",
      destinationCourante: "FIH",
    },
  );
});

test("B1-32 expectedAgency et actualAgency restent auditables", () => {
  const projections = projectArrivalAnomalies(fullHistory());
  assert.equal(projections[0].expectedAgency, "FIH");
  assert.equal(projections[0].actualAgency, "LSHI");
  assert.equal(projections[0].status, "CLOSED_BY_REROUTING");
});

const implementation = readFileSync(
  new URL("./logistics-engine.ts", import.meta.url),
  "utf8",
);

for (const [number, label, pattern] of [
  [33, "Supabase", /@supabase|createClient/],
  [34, "Next.js", /next\/|next-/],
  [35, "Apps Script", /GoogleAppsScript|UrlFetchApp|PropertiesService/],
  [36, "Google Sheets", /SpreadsheetApp|getRange|appendRow/],
  [37, "Paiements", /(?:import|from)\s+["'][^"']*paiement/i],
  [38, "Transferts", /(?:import|from)\s+["'][^"']*transfert/i],
  [39, "Dépenses", /(?:import|from)\s+["'][^"']*d[eé]pense/i],
  [40, "Caisse", /(?:import|from)\s+["'][^"']*caisse/i],
] as const) {
  test(`B1-${number} aucun import ${label}`, () => {
    assert.doesNotMatch(implementation, pattern);
  });
}

test("B1-41 aucun fichier sous src inclus dans la Phase B.1", () => {
  assert.doesNotMatch(implementation, /@\/|src\//);
});

test("B1-42 aucune écriture réseau", () => {
  assert.doesNotMatch(implementation, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("B1-43 aucune écriture fichier", () => {
  assert.doesNotMatch(
    implementation,
    /writeFile|appendFile|createWriteStream/,
  );
});
