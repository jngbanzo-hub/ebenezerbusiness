import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sortAdminNotificationsNewestFirst } from "./admin-notification-order.ts";

describe("sortAdminNotificationsNewestFirst", () => {
  it("place les notifications les plus récentes en premier", () => {
    const result = sortAdminNotificationsNewestFirst([
      { id: "ancienne", occurredAt: "2026-08-25T18:20:00.000Z" },
      { id: "recente", occurredAt: "2026-08-26T12:10:00.000Z" },
      { id: "milieu", occurredAt: "2026-08-26T10:30:00.000Z" }
    ]);

    assert.deepEqual(result.map((item) => item.id), ["recente", "milieu", "ancienne"]);
  });

  it("utilise l'identifiant comme second critère stable", () => {
    const result = sortAdminNotificationsNewestFirst([
      { id: "alerte-a", occurredAt: "2026-08-26T12:10:00.000Z" },
      { id: "alerte-b", occurredAt: "2026-08-26T12:10:00.000Z" }
    ]);

    assert.deepEqual(result.map((item) => item.id), ["alerte-b", "alerte-a"]);
  });

  it("ne modifie pas le tableau source", () => {
    const source = [
      { id: "ancienne", occurredAt: "2026-08-25T18:20:00.000Z" },
      { id: "recente", occurredAt: "2026-08-26T12:10:00.000Z" }
    ];

    sortAdminNotificationsNewestFirst(source);
    assert.deepEqual(source.map((item) => item.id), ["ancienne", "recente"]);
  });
});
