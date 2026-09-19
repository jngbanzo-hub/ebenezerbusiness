import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's type-stripping test runner loads the TypeScript source directly.
import { evaluateManifestQrCandidates, type ManifestQrRegistryRow, type ManifestQrSourceRow } from "./qr-manifest-candidate-evaluator.ts";

const source = (overrides: Partial<ManifestQrSourceRow> = {}): ManifestQrSourceRow => ({
  agency: "FIH",
  rowNumber: 2,
  date: "16/08/2026",
  trackingCode: "MR12326",
  qrNumber: "103",
  ...overrides
});

const qr = (displayNumber: number, status: ManifestQrRegistryRow["status"] = "UNASSIGNED"): ManifestQrRegistryRow => ({
  qrId: `EEBQR${String(displayNumber).padStart(6, "0")}`,
  displayNumber,
  status,
  version: status === "UNASSIGNED" ? 1 : 2
});

test("détecte les lignes valides FIH, LSHI et KLZ sans mutation", () => {
  const rows = [
    source(),
    source({ agency: "LSHI", rowNumber: 3, qrNumber: "102", trackingCode: "JL45626" }),
    source({ agency: "KLZ", rowNumber: 4, qrNumber: "101", trackingCode: "AT09526" })
  ];
  const result = evaluateManifestQrCandidates(rows, [qr(101), qr(102), qr(103)], []);
  assert.deepEqual(result.map((line) => line.result), ["READY", "READY", "READY"]);
  assert.deepEqual(result.map((line) => line.agency), ["FIH", "LSHI", "KLZ"]);
});

test("normalise 002 ou 2 vers le numéro visible 002", () => {
  const result = evaluateManifestQrCandidates([
    source({ qrNumber: "002" }),
    source({ rowNumber: 3, qrNumber: "2", trackingCode: "OTHER2" })
  ], [qr(2)], []);
  assert.deepEqual(result.map((line) => line.displayNumber), ["002", "002"]);
  assert.deepEqual(result.map((line) => line.result), ["DUPLICATE_QR_IN_MANIFEST", "DUPLICATE_QR_IN_MANIFEST"]);
});

test("ignore H vide et signale les champs obligatoires absents", () => {
  const result = evaluateManifestQrCandidates([
    source({ qrNumber: "" }),
    source({ rowNumber: 3, qrNumber: "104", date: "" }),
    source({ rowNumber: 4, qrNumber: "105", trackingCode: "" })
  ], [qr(104), qr(105)], []);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((line) => line.result), ["MISSING_DATE", "MISSING_TRACKING_CODE"]);
});

test("refuse QR inconnu, QR déjà associé et colis déjà associé", () => {
  const result = evaluateManifestQrCandidates([
    source({ qrNumber: "999999" }),
    source({ rowNumber: 3, qrNumber: "013", trackingCode: "AT09426", agency: "KLZ" }),
    source({ rowNumber: 4, qrNumber: "104", trackingCode: "USED104" })
  ], [{ ...qr(13, "ASSIGNED"), agency: "KLZ", trackingCode: "AT09426" }, qr(104)], [{ qrId: "EEBQR000999", agency: "FIH", trackingCode: "USED104" }]);
  assert.deepEqual(result.map((line) => line.result), ["QR_UNKNOWN", "QR_ALREADY_ASSIGNED", "PARCEL_ALREADY_ASSIGNED"]);
  assert.equal(result[1]?.currentAgency, "KLZ");
  assert.equal(result[1]?.currentTrackingCode, "AT09426");
  assert.equal(result.some((line) => line.ready), false);
});

test("isole ASSIGNED et REVOKED sans bloquer une autre ligne UNASSIGNED", () => {
  const result = evaluateManifestQrCandidates([
    source({ qrNumber: "002", trackingCode: "AT11126" }),
    source({ rowNumber: 3, qrNumber: "013", agency: "KLZ", trackingCode: "NEW013" }),
    source({ rowNumber: 4, qrNumber: "014", trackingCode: "AT11426" })
  ], [
    qr(2),
    { ...qr(13, "ASSIGNED"), agency: "KLZ", trackingCode: "AT09426" },
    qr(14, "REVOKED")
  ], []);
  assert.deepEqual(result.map((line) => line.result), ["READY", "QR_ALREADY_ASSIGNED", "QR_REVOKED"]);
  assert.deepEqual(result.map((line) => line.ready), [true, false, false]);
});

test("refuse le même QR et le même colis saisis deux fois", () => {
  const duplicateQr = evaluateManifestQrCandidates([
    source({ qrNumber: "101" }),
    source({ rowNumber: 3, qrNumber: "0101", trackingCode: "OTHER101" })
  ], [qr(101)], []);
  assert.deepEqual(duplicateQr.map((line) => line.result), ["DUPLICATE_QR_IN_MANIFEST", "DUPLICATE_QR_IN_MANIFEST"]);

  const duplicateParcel = evaluateManifestQrCandidates([
    source({ qrNumber: "101", trackingCode: "AT09B/C-D", agency: "KLZ" }),
    source({ rowNumber: 3, qrNumber: "102", trackingCode: "AT09B/C-D", agency: "KLZ" })
  ], [qr(101), qr(102)], []);
  assert.deepEqual(duplicateParcel.map((line) => line.result), ["DUPLICATE_PARCEL_IN_MANIFEST", "DUPLICATE_PARCEL_IN_MANIFEST"]);
  assert.equal(duplicateParcel[0]?.trackingCode, "AT09B/C-D");
});
