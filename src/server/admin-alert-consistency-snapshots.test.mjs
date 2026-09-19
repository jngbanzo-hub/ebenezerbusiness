import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildConsistencyInputsFromSnapshots, canonicalAlertParcelCode } from "./admin-alert-consistency-snapshots.ts";

test("contrôle sans échantillonnage trois puis 108 QR cohérents", () => {
  for (const count of [3, 108]) {
    const assignments = Array.from({ length: count }, (_, index) => ({ agency: "FIH", trackingCode: `AT${String(index + 1).padStart(5, "0")}` }));
    const manifest = assignments.map((row, index) => ({ agency: row.agency, trackingCode: row.trackingCode, rowNumber: index + 2 }));
    const checks = buildConsistencyInputsFromSnapshots({ assignments, manifest, storage: [] });
    assert.equal(checks.length, count);
    assert.ok(checks.every((check) => check.input.manifest.length === 1 && check.input.qr.length === 1));
  }
});

test("conserve les agences distinctes pour un même code", () => {
  const checks = buildConsistencyInputsFromSnapshots({
    assignments: [{ agency: "FIH", trackingCode: "AT00126" }],
    manifest: [
      { agency: "FIH", trackingCode: "AT00126", rowNumber: 2 },
      { agency: "LSHI", trackingCode: "AT00126", rowNumber: 7 }
    ],
    storage: []
  });
  assert.deepEqual(checks[0].input.manifest, [{ agency: "FIH", rowNumber: 2 }, { agency: "LSHI", rowNumber: 7 }]);
});

test("ne fusionne pas CODE et CODEB", () => {
  const checks = buildConsistencyInputsFromSnapshots({
    assignments: [{ agency: "FIH", trackingCode: "CODE" }, { agency: "FIH", trackingCode: "CODEB" }],
    manifest: [{ agency: "FIH", trackingCode: "CODE", rowNumber: 2 }, { agency: "LSHI", trackingCode: "CODEB", rowNumber: 3 }],
    storage: []
  });
  assert.equal(checks.length, 2);
  assert.deepEqual(checks.map((check) => check.code), ["CODE", "CODEB"]);
  assert.ok(checks.every((check) => check.input.manifest.length === 1));
});

test("normalise uniquement le suffixe technique terminal KLZ", () => {
  assert.equal(canonicalAlertParcelCode("CODEBklz", "KLZ"), "CODEB");
  assert.equal(canonicalAlertParcelCode("CODEB", "KLZ"), "CODEB");
  assert.equal(canonicalAlertParcelCode("CODEBklz", "FIH"), "CODEBKLZ");
  assert.equal(canonicalAlertParcelCode("CODEC", "KLZ"), "CODEC");
  assert.equal(canonicalAlertParcelCode("CODED", "KLZ"), "CODED");
});

test("le Centre charge chaque source Google au plus une fois et conserve l'indisponibilité contrôlée", () => {
  const service = readFileSync(new URL("./admin-alert-center.ts", import.meta.url), "utf8");
  assert.equal((service.match(/=>readAdminPayments\(\)/g) ?? []).length, 1);
  assert.equal((service.match(/=>readAdminManifestRows\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(service, /searchAdminParcelGlobally|readShipmentStatistics|codes\.map\([^)]*search/);
  assert.match(service, /sourceUnavailable\(category,now\)/);
  assert.match(service, /\[admin-alerts-trace\]/);
});
