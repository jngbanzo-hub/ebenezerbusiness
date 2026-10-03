import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./reception-statistics-page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/agent/reception-statistics/route.ts", import.meta.url), "utf8");

test("le menu et la route Agent acceptent En Vol et En Transit sans changer le périmètre", () => {
  assert.match(page, /<Select label="Statut groupage"[^>]*options=\{\["ALL","ARRIVE","EN ATTENTE","EN VOL","EN TRANSIT"\]\}/);
  assert.match(route, /\["ALL", "ARRIVE", "EN ATTENTE", "EN VOL", "EN TRANSIT"\]\.includes\(status\)/);
  assert.match(route, /authorizeAgentRequest\(request\)/);
  assert.match(route, /const agency = authorization\.identity\.site/);
  assert.match(route, /params\.has\("destination"\)/);
  assert.match(route, /readShipmentStatistics\(\)/);
  assert.match(route, /projectReceptionStatistics\(source\.shipments, agency/);
});
