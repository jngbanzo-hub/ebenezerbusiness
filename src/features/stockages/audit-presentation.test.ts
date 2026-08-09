import assert from "node:assert/strict";
import test from "node:test";

import { auditActionLabel, buildAuditPresentation } from "./audit-presentation";

test("présente une réconciliation physique sans altérer l'audit source", () => {
  const row = {
    audit_id: "audit-1234567890abcdefghijklmnopqrstuvwxyz",
    action: "PHYSICAL_INVENTORY_RECONCILED",
    agency: "KLZ",
    admin_name: "Admin Test",
    occurred_at: "2026-08-09T15:46:18.9928+00:00",
    reason: "Inventaire physique validé",
    old_value: { parcelCount: 24, weightKg: 151 },
    new_value: { parcelCount: 18, weightKg: 118, parcels: [{ trackingCode: "AV02526" }] },
  };
  const snapshot = JSON.stringify(row);
  const result = buildAuditPresentation(row);

  assert.equal(result.action, "Réconciliation inventaire physique");
  assert.equal(result.oldState, "24 colis / 151 kg");
  assert.equal(result.newState, "18 colis / 118 kg");
  assert.equal(result.agency, "KLZ");
  assert.equal(result.dateKey, "2026-08-09");
  assert.match(result.occurredAt, /^09\/08\/2026 à \d{2}:\d{2}$/);
  assert.match(result.auditId, /^audit-1234…/);
  assert.equal(JSON.stringify(row), snapshot);
});

test("présente un ajustement financier avec ancien état, mouvement et nouvel état", () => {
  const result = buildAuditPresentation({
    audit_id: "cash-audit-1",
    action: "ADMIN_ADJUSTMENT",
    agency: "KLZ",
    admin_name: "Admin Test",
    occurred_at: "2026-08-09T10:00:00Z",
    reason: "Rapprochement",
    old_value: { balance: 472, currency: "USD" },
    new_value: { balance: 599, currency: "USD" },
  });

  assert.equal(result.action, "Ajustement Admin");
  assert.equal(result.oldState, "472 USD");
  assert.equal(result.adjustment, "+127 USD");
  assert.equal(result.newState, "599 USD");
});

test("traduit les actions réelles et nettoie un code inconnu sans casser l'affichage", () => {
  assert.equal(auditActionLabel("OPENING_STOCK_RECORDED"), "Stock initial enregistré");
  assert.equal(auditActionLabel("OPENING_BALANCE_RECORDED"), "Solde initial enregistré");
  assert.equal(auditActionLabel("SOME_FUTURE_ACTION"), "Some future action");
});
