import assert from "node:assert/strict";
import test from "node:test";

import {
  applyStockageCommand,
  classifyIdempotency,
  normalizeStockageAgency,
  StockageContractError,
  type StockageAccount,
  type StockageCommand,
} from "./contracts";

const suspended: StockageAccount = Object.freeze({
  agency: "LSHI", status: "SUSPENDED", currentParcelCount: 0, currentWeightKg: 0, version: 0,
});
const active: StockageAccount = Object.freeze({
  agency: "LSHI", status: "ACTIVE", currentParcelCount: 4, currentWeightKg: 20, version: 3,
});
const command = (overrides: Partial<StockageCommand> = {}): StockageCommand => Object.freeze({
  requestId: "request-0001", commandHash: "sha256:abcdefgh", eventType: "MANUAL_ARRIVAL_RECORDED",
  agency: "LSHI", parcelCount: 2, weightKg: 5, actorUserId: "agent-0001",
  businessDate: "2026-08-01", trackingCode: null, reason: null, ...overrides,
});

test("accepte uniquement FIH LSHI et KLZ", () => {
  assert.equal(normalizeStockageAgency(" fih "), "FIH");
  assert.equal(normalizeStockageAgency("lshi"), "LSHI");
  assert.equal(normalizeStockageAgency("KLZ"), "KLZ");
});

test("refuse COO et COTONOU", () => {
  for (const agency of ["COO", "COTONOU"]) {
    assert.throws(() => normalizeStockageAgency(agency), (error) =>
      error instanceof StockageContractError && error.code === "COO_HAS_NO_STORAGE");
  }
});

test("ouvre une agence indépendamment", () => {
  const result = applyStockageCommand(suspended, command({ eventType: "OPENING_STOCK_RECORDED", parcelCount: 10, weightKg: 25 }));
  assert.deepEqual(result, { agency: "LSHI", status: "ACTIVE", currentParcelCount: 10, currentWeightKg: 25, version: 1 });
});

test("refuse un mouvement sur compte suspendu", () => {
  assert.throws(() => applyStockageCommand(suspended, command()), /État du compte incompatible/);
});

test("cumule deux arrivages distincts dans le compte agence unique", () => {
  const first = applyStockageCommand(active, command());
  const second = applyStockageCommand(first, command({ requestId: "request-0002", parcelCount: 1, weightKg: 3 }));
  assert.equal(second.currentParcelCount, 7);
  assert.equal(second.currentWeightKg, 28);
  assert.equal(second.version, 5);
});

test("une livraison physique diminue colis et poids", () => {
  const result = applyStockageCommand(active, command({ eventType: "CONFIRMED_DELIVERY_RECORDED", parcelCount: 1, weightKg: 4, trackingCode: "JL114826B" }));
  assert.equal(result.currentParcelCount, 3);
  assert.equal(result.currentWeightKg, 16);
});

test("refuse une livraison sans code colis", () => {
  assert.throws(() => applyStockageCommand(active, command({ eventType: "CONFIRMED_DELIVERY_RECORDED", parcelCount: 1, weightKg: 4 })), /Code colis obligatoire/);
});

test("prévient atomiquement un stock négatif", () => {
  assert.throws(() => applyStockageCommand(active, command({ eventType: "CONFIRMED_DELIVERY_RECORDED", parcelCount: 5, weightKg: 21, trackingCode: "JL114826B" })),
    (error) => error instanceof StockageContractError && error.code === "INSUFFICIENT_STOCK");
  assert.equal(active.currentParcelCount, 4);
  assert.equal(active.currentWeightKg, 20);
});

test("rejoue la même requête avec la même empreinte", () => {
  assert.equal(classifyIdempotency({ requestId: "request-0001", commandHash: "sha256:abcdefgh" }, "request-0001", "sha256:abcdefgh"), "REPLAY");
});

test("refuse le même requestId avec un contenu différent", () => {
  assert.throws(() => classifyIdempotency({ requestId: "request-0001", commandHash: "sha256:abcdefgh" }, "request-0001", "sha256:different"),
    (error) => error instanceof StockageContractError && error.code === "IDEMPOTENCY_CONFLICT");
});

test("ne mute jamais le compte d'entrée", () => {
  const before = structuredClone(active);
  const result = applyStockageCommand(active, command());
  assert.deepEqual(active, before);
  assert.notEqual(result, active);
  assert.equal(Object.isFrozen(result), true);
});

test("refuse une agence différente du compte", () => {
  assert.throws(() => applyStockageCommand(active, command({ agency: "FIH" })), /Agence incohérente/);
});

test("refuse poids et quantités invalides", () => {
  assert.throws(() => applyStockageCommand(active, command({ parcelCount: 0 })), /Nombre de colis invalide/);
  assert.throws(() => applyStockageCommand(active, command({ weightKg: 0 })), /Poids invalide/);
});

test("le contrat ne contient aucun événement de paiement ou MANIFESTE", () => {
  const types = ["OPENING_STOCK_RECORDED", "MANUAL_ARRIVAL_RECORDED", "CONFIRMED_DELIVERY_RECORDED", "ADMIN_STOCK_ADJUSTMENT_RECORDED", "STOCK_CORRECTION_RECORDED"];
  assert.equal(types.some((type) => /PAYMENT|MANIFEST/.test(type)), false);
});
