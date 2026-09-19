import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AgentAuthorizationResult } from "@/server/agent-authorization";

import { CooDepositCommandService } from "./coo-deposit-command";
import { createCooDepositPostHandler } from "./coo-deposit-handler";

const authorized: AgentAuthorizationResult = {
  authorized: true,
  identity: {
    userId: "agent-coo-001",
    email: "agent@example.test",
    nom: "Agent COO",
    role: "AGENT",
    agence: "COTONOU",
    site: "COO",
  },
};

function service() {
  return new CooDepositCommandService({
    parcelResolver: {
      async resolveByTrackingCode() {
        return {
          parcelId: "parcel-001",
          trackingCode: "COO-NEW-001",
          destination: "FIH",
          weightKg: 1,
          sourceId: "source-001",
        };
      },
    },
    eventSource: { async readEventsByTrackingCode() { return null; } },
    replayLookup: { async readEventById() { return null; } },
    producer: { async appendEvent() { return {} as never; } },
    now: () => new Date("2026-08-01T10:00:00.000Z"),
  });
}

function request(body: unknown) {
  return new Request("http://localhost/api/agent/logistics/entry-coo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("route authentifiée retourne 201 pour une première entrée", async () => {
  const response = await createCooDepositPostHandler(async () => authorized, service())(
    request({
      trackingCode: "COO-NEW-001",
      requestId: "deposit-request-001",
      confirmationPhysicalDeposit: true,
    }),
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).agency, "COO");
});

test("route refuse une session absente avant toute commande", async () => {
  let constructed = false;
  const response = await createCooDepositPostHandler(
    async () => ({ authorized: false, status: 401 }),
    () => {
      constructed = true;
      return service();
    },
  )(request({}));
  assert.equal(response.status, 401);
  assert.equal(constructed, false);
});

test("la route Next exporte uniquement POST, dynamic et runtime", () => {
  const source = readFileSync(new URL("./entry-coo/route.ts", import.meta.url), "utf8");
  const exports = Array.from(
    source.matchAll(/export (?:const|async function) (\w+)/g),
    (match) => match[1],
  );
  assert.deepEqual(exports.sort(), ["POST", "dynamic", "runtime"]);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /LOGISTICS_COO_DEPOSIT_ENABLED/);
});
