import assert from "node:assert/strict";
import test from "node:test";

import { findLocalParcelHistory } from "./local-logistics-source";
import { GET } from "./route";

const request = (trackingCode?: string) =>
  new Request(
    trackingCode === undefined
      ? "http://localhost/api/agent/logistics"
      : `http://localhost/api/agent/logistics?trackingCode=${encodeURIComponent(
          trackingCode,
        )}`,
  );

test("retourne le modèle local d'un colis trouvé", async () => {
  const response = await GET(request(" local-log-001 "));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.trackingCode, "LOCAL-LOG-001");
  assert.equal(body.locationState, "AT_AGENCY");
  assert.equal(body.currentAgency, "LSHI");
  assert.equal(body.agentStatus, "EN_AGENCE");
  assert.equal(body.version, 3);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("retourne 400 lorsque trackingCode est absent", async () => {
  const response = await GET(request());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_TRACKING_CODE",
      message: "Le paramètre trackingCode est absent ou invalide.",
    },
  });
});

test("retourne 404 lorsque le colis est introuvable", async () => {
  const response = await GET(request("UNKNOWN-001"));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "PARCEL_NOT_FOUND");
});

test("retourne 422 sans inventer de position pour un historique invalide", async () => {
  const response = await GET(request("LOCAL-INVALID-001"));
  assert.equal(response.status, 422);
  assert.equal(
    (await response.json()).error.code,
    "INVALID_LOGISTICS_HISTORY",
  );
});

test("expose l'anomalie d'arrivée active", async () => {
  const response = await GET(request("LOCAL-LOG-001"));
  const body = await response.json();
  assert.equal(body.activeArrivalAnomaly.expectedAgency, "FIH");
  assert.equal(body.activeArrivalAnomaly.actualAgency, "LSHI");
});

test("n'expose aucun champ financier", async () => {
  const body = await (await GET(request("LOCAL-LOG-001"))).json();
  assert.equal("amount" in body, false);
  assert.equal("currency" in body, false);
  assert.equal("paymentStatus" in body, false);
  assert.equal("fees" in body, false);
});

test("la lecture ne modifie pas la source locale et aucune route d'écriture n'existe", async () => {
  const history = findLocalParcelHistory("LOCAL-LOG-001");
  assert.notEqual(history, null);
  const before = JSON.stringify(history);

  await GET(request("LOCAL-LOG-001"));

  assert.equal(JSON.stringify(history), before);
  assert.equal(Object.isFrozen(history), true);
  const route = await import("./route");
  assert.deepEqual(Object.keys(route).sort(), ["GET", "dynamic", "runtime"]);
});
