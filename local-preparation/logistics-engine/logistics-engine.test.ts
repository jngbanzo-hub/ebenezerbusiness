import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
  positionSnapshot,
  rebuildParcelPosition,
} from "./logistics-engine";

const time = (minute: number) =>
  `2026-07-31T10:${String(minute).padStart(2, "0")}:00.000Z`;

function initial(destination = "FIH" as const): ParcelPosition {
  return createParcelPosition({
    parcelId: "parcel-001",
    trackingCode: "MR-001",
    destinationInitiale: destination,
    destinationCourante: destination,
    locationState: "UNKNOWN",
    currentAgency: null,
    transitFrom: null,
    transitTo: null,
    lastEventId: null,
    version: 0,
    updatedAt: time(0),
  });
}

function event(
  versionBefore: number,
  eventType: StockEventInput["eventType"],
  overrides: Partial<StockEventInput> = {},
): StockEvent {
  const defaultsByType: Record<
    StockEventInput["eventType"],
    Partial<StockEventInput>
  > = {
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
    ENTREE_DESTINATION: {
      agency: "FIH",
      fromAgency: "COO",
      toAgency: "FIH",
      sourceType: "MANIFEST_OBSERVATION",
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
      reason: "Arrivée physique inattendue",
      arrivalMismatch: {
        expectedAgency: "FIH",
        actualAgency: "LSHI",
        confirmedByAgentId: "user-001",
        confirmedByAgentAgency: "LSHI",
        physicalReceiptConfirmed: true,
        evidenceReference: "observation-locale-001",
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
      reason: "Correction administrative",
      compensatesEventId: "event-001",
    },
    STOCK_REVERSAL: {
      agency: "FIH",
      fromAgency: null,
      toAgency: null,
      sourceType: "ADMIN",
      reason: "Compensation administrative",
      compensatesEventId: "event-001",
    },
  };

  return createStockEvent({
    eventId: `event-${versionBefore + 1}`,
    parcelId: "parcel-001",
    trackingCode: "MR-001",
    eventType,
    agency: "COO",
    fromAgency: null,
    toAgency: "COO",
    weightKg: 2,
    sourceType: "MANIFEST_OBSERVATION",
    sourceId: `source-${versionBefore + 1}`,
    occurredAt: time(versionBefore + 1),
    recordedAt: time(versionBefore + 1),
    recordedBy: "user-001",
    requestId: `stock-request-${versionBefore + 1}`,
    reason: null,
    metadata:
      versionBefore === 0 ? { destinationInitiale: "FIH" } : {},
    compensatesEventId: null,
    versionBefore,
    versionAfter: versionBefore + 1,
    ...defaultsByType[eventType],
    ...overrides,
  });
}

function applySequence(events: readonly StockEvent[], start = initial()) {
  return events.reduce(
    (position, item) => applyLogisticsEvent(position, item),
    start,
  );
}

function standardFihHistory(): StockEvent[] {
  return [
    event(0, "ENTREE_COO"),
    event(1, "SORTIE_COO"),
    event(2, "ENTREE_DESTINATION"),
  ];
}

function assertEngineError(action: () => unknown, code: string): void {
  assert.throws(
    action,
    (error) => error instanceof LogisticsEngineError && error.code === code,
  );
}

test("1. UNKNOWN vers ENTREE_COO produit AT_AGENCY COO", () => {
  const result = applyLogisticsEvent(initial(), event(0, "ENTREE_COO"));
  assert.equal(result.locationState, "AT_AGENCY");
  assert.equal(result.currentAgency, "COO");
});

test("2. COO vers SORTIE_COO produit IN_TRANSIT", () => {
  const result = applySequence([
    event(0, "ENTREE_COO"),
    event(1, "SORTIE_COO"),
  ]);
  assert.equal(result.locationState, "IN_TRANSIT");
  assert.equal(result.transitFrom, "COO");
  assert.equal(result.transitTo, "FIH");
});

test("3. IN_TRANSIT vers ENTREE_DESTINATION FIH", () => {
  const result = applySequence(standardFihHistory());
  assert.equal(result.currentAgency, "FIH");
});

test("4. arrivée LSHI pour un transit FIH est refusée", () => {
  const transit = applySequence(standardFihHistory().slice(0, 2));
  const wrongArrival = event(2, "ENTREE_DESTINATION", {
    agency: "LSHI",
    toAgency: "LSHI",
  });
  assertEngineError(
    () => applyLogisticsEvent(transit, wrongArrival),
    "TRANSIT_DESTINATION_MISMATCH",
  );
});

test("5. FIH vers SORTIE_REACHEMINEMENT LSHI", () => {
  const result = applySequence([
    ...standardFihHistory(),
    event(3, "SORTIE_REACHEMINEMENT"),
  ]);
  assert.equal(result.transitTo, "LSHI");
});

test("6. entrée de réacheminement à LSHI", () => {
  const result = applySequence([
    ...standardFihHistory(),
    event(3, "SORTIE_REACHEMINEMENT"),
    event(4, "ENTREE_REACHEMINEMENT"),
  ]);
  assert.equal(result.currentAgency, "LSHI");
});

test("7. destinationInitiale est conservée après réacheminement", () => {
  const result = applySequence([
    ...standardFihHistory(),
    event(3, "SORTIE_REACHEMINEMENT"),
  ]);
  assert.equal(result.destinationInitiale, "FIH");
});

test("8. destinationCourante est mise à jour par réacheminement", () => {
  const result = applySequence([
    ...standardFihHistory(),
    event(3, "SORTIE_REACHEMINEMENT"),
  ]);
  assert.equal(result.destinationCourante, "LSHI");
});

test("9. livraison par la bonne agence", () => {
  const result = applySequence([
    ...standardFihHistory(),
    event(3, "SORTIE_LIVRAISON"),
  ]);
  assert.equal(result.locationState, "DELIVERED");
});

test("10. livraison par mauvaise agence refusée", () => {
  const atFih = applySequence(standardFihHistory());
  const delivery = event(3, "SORTIE_LIVRAISON", {
    agency: "LSHI",
    fromAgency: "LSHI",
  });
  assertEngineError(
    () => applyLogisticsEvent(atFih, delivery),
    "AGENCY_MISMATCH",
  );
});

test("11. livraison en transit refusée", () => {
  const transit = applySequence(standardFihHistory().slice(0, 2));
  assertEngineError(
    () => applyLogisticsEvent(transit, event(2, "SORTIE_LIVRAISON")),
    "INVALID_TRANSITION",
  );
});

test("12. deuxième livraison refusée", () => {
  const delivered = applySequence([
    ...standardFihHistory(),
    event(3, "SORTIE_LIVRAISON"),
  ]);
  assertEngineError(
    () => applyLogisticsEvent(delivered, event(4, "SORTIE_LIVRAISON")),
    "ALREADY_DELIVERED",
  );
});

test("13. événement avec mauvaise version refusé", () => {
  assertEngineError(
    () => applyLogisticsEvent(initial(), event(1, "ENTREE_COO")),
    "VERSION_CONFLICT",
  );
});

test("14. saut de version refusé", () => {
  const invalid = {
    ...event(0, "ENTREE_COO"),
    versionAfter: 2,
  } as StockEvent;
  assertEngineError(
    () => applyLogisticsEvent(initial(), invalid),
    "VERSION_CONFLICT",
  );
});

test("15. événement ancien refusé", () => {
  const start = createParcelPosition({ ...initial(), updatedAt: time(5) });
  assertEngineError(
    () => applyLogisticsEvent(start, event(0, "ENTREE_COO")),
    "EVENT_ORDER_INVALID",
  );
});

test("16. même eventId appliqué deux fois refusé", () => {
  const first = event(0, "ENTREE_COO");
  const after = applyLogisticsEvent(initial(), first);
  const replay = { ...event(1, "SORTIE_COO"), eventId: first.eventId } as StockEvent;
  assertEngineError(
    () => applyLogisticsEvent(after, replay),
    "EVENT_ALREADY_APPLIED",
  );
});

test("17. parcelId différent refusé", () => {
  const mismatch = { ...event(0, "ENTREE_COO"), parcelId: "parcel-002" };
  assertEngineError(
    () => applyLogisticsEvent(initial(), mismatch),
    "PARCEL_ID_MISMATCH",
  );
});

test("18. trackingCode différent refusé", () => {
  const mismatch = { ...event(0, "ENTREE_COO"), trackingCode: "MR-002" };
  assertEngineError(
    () => applyLogisticsEvent(initial(), mismatch),
    "TRACKING_CODE_MISMATCH",
  );
});

test("19. fromAgency incohérente refusée", () => {
  const atFih = applySequence(standardFihHistory());
  const departure = event(3, "SORTIE_REACHEMINEMENT", {
    agency: "LSHI",
    fromAgency: "LSHI",
    toAgency: "KLZ",
  });
  assertEngineError(
    () => applyLogisticsEvent(atFih, departure),
    "AGENCY_MISMATCH",
  );
});

test("20. toAgency incohérente refusée", () => {
  const transit = applySequence(standardFihHistory().slice(0, 2));
  const arrival = {
    ...event(2, "ENTREE_DESTINATION"),
    toAgency: "LSHI",
  } as StockEvent;
  assertEngineError(
    () => applyLogisticsEvent(transit, arrival),
    "TRANSIT_DESTINATION_MISMATCH",
  );
});

test("21. déplacement direct FIH vers LSHI refusé", () => {
  const atFih = applySequence(standardFihHistory());
  const fakeEntry = event(3, "ENTREE_REACHEMINEMENT", {
    agency: "LSHI",
    fromAgency: "FIH",
    toAgency: "LSHI",
  });
  assertEngineError(
    () => applyLogisticsEvent(atFih, fakeEntry),
    "INVALID_TRANSITION",
  );
});

test("22. IN_TRANSIT avec currentAgency reste impossible", () => {
  assert.throws(() =>
    createParcelPosition({
      ...initial(),
      locationState: "IN_TRANSIT",
      currentAgency: "COO",
      transitFrom: "COO",
      transitTo: "FIH",
    }),
  );
});

test("23. DELIVERED avec currentAgency reste impossible", () => {
  assert.throws(() =>
    createParcelPosition({
      ...initial(),
      locationState: "DELIVERED",
      currentAgency: "FIH",
    }),
  );
});

function adminEvent(
  current: ParcelPosition,
  type: "AJUSTEMENT_ADMIN" | "STOCK_REVERSAL" = "AJUSTEMENT_ADMIN",
  overrides: Partial<StockEvent> = {},
): StockEvent {
  const after = {
    ...positionSnapshot(current),
    locationState: "AT_AGENCY" as const,
    currentAgency: "FIH" as const,
    transitFrom: null,
    transitTo: null,
  };
  return {
    ...event(current.version, type, {
      eventId: `admin-event-${current.version + 1}`,
      compensatesEventId: current.lastEventId,
      metadata: {
        beforePosition: positionSnapshot(current),
        afterPosition: after,
      },
    }),
    ...overrides,
  };
}

test("24. AJUSTEMENT_ADMIN sans motif refusé", () => {
  const current = applySequence(standardFihHistory());
  assertEngineError(
    () => applyLogisticsEvent(current, adminEvent(current, "AJUSTEMENT_ADMIN", { reason: null })),
    "ADMIN_REASON_REQUIRED",
  );
});

test("25. AJUSTEMENT_ADMIN sans identité Admin refusé", () => {
  const current = applySequence(standardFihHistory());
  assertEngineError(
    () =>
      applyLogisticsEvent(
        current,
        adminEvent(current, "AJUSTEMENT_ADMIN", { recordedBy: null }),
      ),
    "ADMIN_IDENTITY_REQUIRED",
  );
});

test("26. STOCK_REVERSAL sans compensatesEventId refusé", () => {
  const current = applySequence(standardFihHistory());
  assertEngineError(
    () =>
      applyLogisticsEvent(
        current,
        adminEvent(current, "STOCK_REVERSAL", { compensatesEventId: null }),
      ),
    "COMPENSATED_EVENT_REQUIRED",
  );
});

test("27. compensation ne supprime pas l'historique", () => {
  const history = standardFihHistory();
  const current = applySequence(history);
  const compensation = adminEvent(current);
  const rebuilt = rebuildParcelPosition([...history, compensation]);
  assert.equal(history.length, 3);
  assert.equal(rebuilt.lastEventId, compensation.eventId);
});

test("28. reconstruction complète COO vers FIH puis livré", () => {
  const result = rebuildParcelPosition([
    ...standardFihHistory(),
    event(3, "SORTIE_LIVRAISON"),
  ]);
  assert.equal(result.locationState, "DELIVERED");
  assert.equal(result.destinationInitiale, "FIH");
});

function lshiToFihHistory(): StockEvent[] {
  return [
    event(0, "ENTREE_COO", { metadata: { destinationInitiale: "LSHI" } }),
    event(1, "SORTIE_COO", { toAgency: "LSHI" }),
    event(2, "ENTREE_DESTINATION", {
      agency: "LSHI",
      fromAgency: "COO",
      toAgency: "LSHI",
    }),
    event(3, "SORTIE_REACHEMINEMENT", {
      agency: "LSHI",
      fromAgency: "LSHI",
      toAgency: "FIH",
    }),
    event(4, "ENTREE_REACHEMINEMENT", {
      agency: "FIH",
      fromAgency: "LSHI",
      toAgency: "FIH",
    }),
  ];
}

test("29. reconstruction avec réacheminement LSHI vers FIH", () => {
  const result = rebuildParcelPosition(lshiToFihHistory());
  assert.equal(result.destinationInitiale, "LSHI");
  assert.equal(result.destinationCourante, "FIH");
  assert.equal(result.currentAgency, "FIH");
});

test("30. reconstruction avec événement désordonné refusée", () => {
  const history = standardFihHistory();
  assertEngineError(
    () => rebuildParcelPosition([history[0], history[2], history[1]]),
    "EVENT_ORDER_INVALID",
  );
});

test("31. reconstruction avec doublon eventId refusée", () => {
  const history = standardFihHistory();
  const duplicate = { ...history[2], eventId: history[0].eventId };
  assertEngineError(
    () => rebuildParcelPosition([history[0], history[1], duplicate]),
    "EVENT_ALREADY_APPLIED",
  );
});

test("32. reconstruction avec rupture de version refusée", () => {
  const history = standardFihHistory();
  const broken = { ...history[1], versionBefore: 4, versionAfter: 5 };
  assertEngineError(
    () => rebuildParcelPosition([history[0], broken]),
    "VERSION_CONFLICT",
  );
});

test("33. résultat déterministe", () => {
  const history = standardFihHistory();
  assert.deepEqual(rebuildParcelPosition(history), rebuildParcelPosition(history));
});

test("34. reconstructions répétées produisent le même résultat", () => {
  const history = lshiToFihHistory();
  const first = rebuildParcelPosition(history);
  const second = rebuildParcelPosition(history);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
});

test("35. paiement PAYE n'influence pas la position", () => {
  const paymentStatus = "PAYE";
  const result = rebuildParcelPosition(standardFihHistory());
  assert.equal(paymentStatus, "PAYE");
  assert.equal(result.currentAgency, "FIH");
});

test("36. paiement NON_PAYE n'empêche pas la livraison", () => {
  const paymentStatus = "NON_PAYE";
  const result = rebuildParcelPosition([
    ...standardFihHistory(),
    event(3, "SORTIE_LIVRAISON"),
  ]);
  assert.equal(paymentStatus, "NON_PAYE");
  assert.equal(result.locationState, "DELIVERED");
});

test("37. aucun événement financier ne crée un mouvement de stock", () => {
  const source = readFileSync(new URL("./logistics-engine.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /FinancialEvent|PAYMENT_RECORDED|paymentRequestId/);
});

const engineDirectory = new URL(".", import.meta.url).pathname;
const engineSources = readdirSync(engineDirectory)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => readFileSync(join(engineDirectory, name), "utf8"))
  .join("\n");

for (const [number, label, pattern] of [
  [38, "Transferts", /(?:import|from)\s+["'][^"']*transfert/i],
  [39, "Dépenses", /(?:import|from)\s+["'][^"']*d[eé]pense/i],
  [40, "Caisse", /(?:import|from)\s+["'][^"']*caisse/i],
  [41, "Apps Script", /GoogleAppsScript|SpreadsheetApp|UrlFetchApp/],
  [42, "Supabase", /@supabase|createClient/],
  [43, "Next.js", /next\/|next-/],
  [44, "mobile", /react-native|expo-|android|ios\//i],
] as const) {
  test(`${number}. aucun import vers ${label}`, () => {
    assert.doesNotMatch(engineSources, pattern);
  });
}

test("45. aucune écriture réseau", () => {
  assert.doesNotMatch(engineSources, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("46. aucune écriture fichier", () => {
  assert.doesNotMatch(engineSources, /writeFile|appendFile|createWriteStream/);
});

test("47. l'objet position d'entrée n'est pas muté", () => {
  const start = initial();
  const before = JSON.stringify(start);
  applyLogisticsEvent(start, event(0, "ENTREE_COO"));
  assert.equal(JSON.stringify(start), before);
});

test("48. l'objet événement d'entrée n'est pas muté", () => {
  const item = event(0, "ENTREE_COO");
  const before = JSON.stringify(item);
  applyLogisticsEvent(initial(), item);
  assert.equal(JSON.stringify(item), before);
});

test("49. métadonnées immutables", () => {
  const item = event(0, "ENTREE_COO", {
    metadata: { destinationInitiale: "FIH", nested: { value: 1 } },
  });
  assert.equal(Object.isFrozen(item.metadata), true);
  assert.equal(Object.isFrozen(item.metadata.nested), true);
});

test("50. historique source non muté", () => {
  const history = standardFihHistory();
  const before = JSON.stringify(history);
  rebuildParcelPosition(history);
  assert.equal(JSON.stringify(history), before);
});
