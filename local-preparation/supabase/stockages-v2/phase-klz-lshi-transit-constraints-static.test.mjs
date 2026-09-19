import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("./012_klz_lshi_transit_constraints.sql", import.meta.url), "utf8");
const rollback = fs.readFileSync(new URL("./012_klz_lshi_transit_constraints.rollback.sql", import.meta.url), "utf8");

const previous = {
  orchestration: ["QUOTE_READY","PAYMENT_IN_PROGRESS","PAID_AWAITING_ARRIVAL","ARRIVAL_CONFIRMED","READY_FOR_DELIVERY","DELIVERED","CANCELLED_BY_COMPENSATION","ANOMALY_REQUIRES_ADMIN"],
  forwarding: ["PAID_AWAITING_ARRIVAL","ARRIVAL_CONFIRMED","READY_FOR_DELIVERY","DELIVERED","CANCELLED_BY_COMPENSATION","ANOMALY_REQUIRES_ADMIN"],
  forwardingEvents: ["PAYMENT_CONFIRMED","FORWARDING_CREATED","FORWARDING_ARRIVED","FORWARDING_READY_FOR_DELIVERY","FORWARDING_DELIVERED","FORWARDING_ANOMALY_RECORDED","FORWARDING_CANCELLED_BY_COMPENSATION"],
  stockageEvents: ["OPENING_STOCK_RECORDED","MANUAL_ARRIVAL_RECORDED","CONFIRMED_DELIVERY_RECORDED","ADMIN_STOCK_ADJUSTMENT_RECORDED","STOCK_CORRECTION_RECORDED","SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION","SORTIE_APRES_REMISE_COLIS_PAYE_COO","SORTIE_APRES_REMISE_ACHEMINEMENT","ARRIVAGE_ACHEMINEMENT","CORRECTION_COMPENSATOIRE_ADMIN"]
};

test("migration preserves every existing allowed value", () => {
  for (const values of Object.values(previous)) for (const value of values) assert.ok(migration.includes(`'${value}'`), value);
});

test("migration adds only the three isolated KLZ-LSHI values", () => {
  assert.equal((migration.match(/'IN_TRANSIT'/g) ?? []).length, 2);
  assert.equal((migration.match(/'FORWARDING_DEPARTED'/g) ?? []).length, 1);
  assert.equal((migration.match(/'SORTIE_POUR_ACHEMINEMENT'/g) ?? []).length, 2);
});

test("parcel status and delivery constraints are untouched", () => {
  assert.doesNotMatch(migration, /stockage_parcels_status_check|stockage_parcels_delivery_check/);
  assert.doesNotMatch(rollback, /stockage_parcels_status_check|stockage_parcels_delivery_check/);
});

test("migration contains no data mutation or behavior activation", () => {
  assert.doesNotMatch(migration, /\b(insert|update|delete|create\s+(or\s+replace\s+)?function|create\s+policy|grant|revoke)\b/i);
});

test("rollback refuses to remove values once used", () => {
  assert.match(rollback, /ROLLBACK_BLOCKED: KLZ_LSHI_TRANSIT_VALUES_ALREADY_USED/);
  for (const value of ["IN_TRANSIT","FORWARDING_DEPARTED","SORTIE_POUR_ACHEMINEMENT"]) assert.ok(rollback.includes(`'${value}'`));
});
