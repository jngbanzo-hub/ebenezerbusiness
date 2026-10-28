import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./forwarding-admin-correction-proof.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { verifyHistoricalTerms } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

const row = { sourceSite: "KLZ", rowNumber: 17, dateRaw: "08/10/2026", codeColisRaw: "TEST04426", expediteurRaw: "", poidsRaw: 3, historicalCurrentPriceFieldRaw: 33, historicalRemainingAmountRaw: 33, historicalPaidAmountRaw: 0 };
const base = { rows: [row], payments: [], originAgency: "KLZ", destinationAgency: "LSHI", trackingCode: "TEST04426", weightKg: 3, forwardingCreatedAt: "2026-10-26T13:57:42Z" };

test("prix historique de l'agence d'origine et du même cycle vérifié", () => {
  assert.deepEqual(verifyHistoricalTerms(base), { state: "VERIFIED", expectedUsd: 33, paidUsd: 0, manifestRowNumber: 17, manifestDate: "2026-10-08", source: "KLZ!F17" });
});

test("homonyme, poids contradictoire et cycle ultérieur refusés", () => {
  assert.equal(verifyHistoricalTerms({ ...base, rows: [row, row] }).state, "AMBIGUOUS");
  assert.equal(verifyHistoricalTerms({ ...base, weightKg: 4 }).state, "AMBIGUOUS");
  assert.equal(verifyHistoricalTerms({ ...base, forwardingCreatedAt: "2026-10-01T00:00:00Z" }).state, "AMBIGUOUS");
});

test("paiement antérieur d'un homonyme dans une autre agence ne prouve pas le paiement de ce cycle", () => {
  const payment = { codeColis: "TEST04426", destinationCode: "LSHI", dateTime: "2026-10-17T12:00:00Z" };
  assert.equal(verifyHistoricalTerms({ ...base, payments: [payment] }).state, "VERIFIED");
  assert.equal(verifyHistoricalTerms({ ...base, payments: [{ ...payment, dateTime: "2026-10-28T12:00:00Z" }] }).state, "AMBIGUOUS");
});

test("prix et paiement contradictoires ne sont pas inventés", () => {
  assert.equal(verifyHistoricalTerms({ ...base, rows: [{ ...row, historicalCurrentPriceFieldRaw: undefined, montantAttenduRaw: undefined }] }).state, "AMBIGUOUS");
  assert.equal(verifyHistoricalTerms({ ...base, rows: [{ ...row, historicalPaidAmountRaw: 1 }] }).state, "AMBIGUOUS");
  assert.equal(verifyHistoricalTerms({ ...base, rows: [{ ...row, historicalRemainingAmountRaw: 39 }] }).state, "AMBIGUOUS");
  assert.equal(verifyHistoricalTerms({ ...base, rows: [{ ...row, historicalPaymentStatusRaw: "✅ PAYÉ — COO" }] }).state, "AMBIGUOUS");
  assert.equal(verifyHistoricalTerms({ ...base, rows: [{ ...row, historicalPaymentStatusRaw: "NON PAYÉ" }] }).state, "VERIFIED");
  assert.equal(verifyHistoricalTerms({ ...base, rows: [{ ...row, dateRaw: "31/02/2026" }] }).state, "AMBIGUOUS");
});
