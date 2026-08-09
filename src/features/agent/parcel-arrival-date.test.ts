import assert from "node:assert/strict";
import test from "node:test";

import { formatParcelArrivalDate } from "./parcel-arrival-date";

test("sépare la date et l'heure du timestamp d'arrivée sans altérer l'heure source", () => {
  assert.deepEqual(formatParcelArrivalDate("2026-08-09T15:46:18.9928+00:00"), {
    date: "09/08/2026",
    time: "15:46"
  });
});

test("conserve une date déjà présentée et indique une heure indisponible", () => {
  assert.deepEqual(formatParcelArrivalDate("09/08/2026"), {
    date: "09/08/2026",
    time: "—"
  });
});
