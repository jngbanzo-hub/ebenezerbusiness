import assert from "node:assert/strict";
import test from "node:test";

import { parsePaymentSheetDate } from "./payment-sheet-date.ts";

const serial = (isoWallTime) => Date.parse(isoWallTime) / 86_400_000 + 25569;

test("une date ISO avec Z conserve son instant UTC", () => {
  assert.deepEqual(parsePaymentSheetDate("2026-09-23T20:57:30.309Z"), {
    dateTime: "2026-09-23T20:57:30.309Z",
    dateKey: "2026-09-23"
  });
});

test("une date de feuille Africa/Porto-Novo retrouve le même instant que l'orchestration", () => {
  const payment = parsePaymentSheetDate(serial("2026-09-23T21:57:30.309Z"));
  assert.deepEqual(payment, {
    dateTime: "2026-09-23T20:57:30.309Z",
    dateKey: "2026-09-23"
  });
});

test("le jour métier de la feuille ne change pas lors du passage à UTC", () => {
  assert.deepEqual(parsePaymentSheetDate(serial("2026-09-24T00:30:00.000Z")), {
    dateTime: "2026-09-23T23:30:00.000Z",
    dateKey: "2026-09-24"
  });
});

test("les dates françaises locales suivent la même normalisation", () => {
  assert.deepEqual(parsePaymentSheetDate("23/09/2026 21:57:30"), {
    dateTime: "2026-09-23T20:57:30.000Z",
    dateKey: "2026-09-23"
  });
});

test("une chaîne ISO sans fuseau est locale, avec Z ou offset elle est déjà UTC", () => {
  assert.equal(parsePaymentSheetDate("2026-09-23T21:57:30")?.dateTime, "2026-09-23T20:57:30.000Z");
  assert.equal(parsePaymentSheetDate("2026-09-23T21:57:30+01:00")?.dateTime, "2026-09-23T20:57:30.000Z");
  assert.equal(parsePaymentSheetDate("2026-09-23T20:57:30Z")?.dateTime, "2026-09-23T20:57:30.000Z");
});

test("les trois agences utilisent une normalisation identique", () => {
  const source = serial("2026-09-23T21:57:30.309Z");
  for (const agency of ["FIH", "LSHI", "KLZ"]) {
    assert.equal(parsePaymentSheetDate(source)?.dateTime, "2026-09-23T20:57:30.309Z", agency);
  }
});
