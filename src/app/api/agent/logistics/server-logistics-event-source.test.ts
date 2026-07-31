import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { StockEvent } from "../../../../../local-preparation/contracts/stock-event";

import type { LogisticsEventSource } from "./logistics-event-source";
import { createLogisticsGetHandler } from "./logistics-get-handler";
import { findLocalParcelHistory } from "./local-logistics-source";
import {
  LOGISTICS_SUPABASE_SOURCE_ENABLED,
  selectLogisticsEventSource,
} from "./server-logistics-event-source";

const localHistory = findLocalParcelHistory("LOCAL-LOG-001");
if (localHistory === null) {
  throw new Error("Fixture logistique locale absente.");
}

function source(
  label: string,
  history: readonly StockEvent[] | null = localHistory,
): LogisticsEventSource & { readonly label: string } {
  return {
    label,
    async readEventsByTrackingCode() {
      return history;
    },
  };
}

const local = source("LOCAL");
const supabase = source("SUPABASE");

test("utilise la source locale par défaut", () => {
  assert.equal(
    selectLogisticsEventSource(undefined, { local, supabase }),
    local,
  );
  assert.equal(LOGISTICS_SUPABASE_SOURCE_ENABLED, "LOGISTICS_SUPABASE_SOURCE_ENABLED");
});

test("active Supabase uniquement avec la valeur serveur explicite true", () => {
  assert.equal(
    selectLogisticsEventSource("true", { local, supabase }),
    supabase,
  );
  assert.equal(
    selectLogisticsEventSource(" TRUE ", { local, supabase }),
    supabase,
  );
});

test("traite toute valeur invalide comme un retour local", () => {
  ["", "false", "1", "yes", "enabled", "invalid"].forEach((value) => {
    assert.equal(
      selectLogisticsEventSource(value, { local, supabase }),
      local,
    );
  });
});

test("conserve le comportement et le format JSON de l’API", async () => {
  for (const selected of [
    selectLogisticsEventSource(undefined, { local, supabase }),
    selectLogisticsEventSource("true", { local, supabase }),
  ]) {
    const response = await createLogisticsGetHandler(selected)(
      new Request(
        "http://localhost/api/agent/logistics?trackingCode=LOCAL-LOG-001",
      ),
    );
    const body = await response.json();
    assert.equal(response.status, 200);
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
  }
});

test("ne place ni le sélecteur ni la clé service_role dans le client", () => {
  const selector = readFileSync(
    new URL("./server-logistics-event-source.ts", import.meta.url),
    "utf8",
  );
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const serviceClient = readFileSync(
    new URL("../../../../server/logistics-supabase-service-client.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(selector, /NEXT_PUBLIC_LOGISTICS/i);
  assert.doesNotMatch(selector, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(serviceClient, /^import "server-only";/);
  assert.match(serviceClient, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(serviceClient, /NEXT_PUBLIC_SUPABASE_SERVICE/i);
});
