import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("./qr-batch-prevalidation.ts", import.meta.url), "utf8");

test("couvre les refus et doublons requis ligne par ligne", () => {
  for (const code of ["QR_UNKNOWN", "QR_ALREADY_ASSIGNED", "QR_REVOKED", "INVALID_CODE", "INVALID_AGENCY", "PARCEL_ALREADY_ASSIGNED", "DUPLICATE_IN_LIST", "SOURCE_UNAVAILABLE"]) {
    assert.match(service, new RegExp(`\\"${code}\\"`));
  }
  assert.match(service, /duplicateQr/);
  assert.match(service, /duplicateParcel/);
});

test("certifie le MANIFESTE et recherche les collisions sans mutation", () => {
  assert.match(service, /dependencies\.readManifestIdentities/);
  assert.match(service, /readCanonicalPaymentManifestRows/);
  assert.match(service, /readRegistry/);
  assert.match(service, /rpc\("read_qr_manifest_registry_server"/);
  assert.doesNotMatch(service, /\.from\("qr_labels"\)/);
  assert.doesNotMatch(service, /\.update\(|\.insert\(|\.delete\(|assign_qr_label_server/);
});

test("groupe les deux sources distantes indépendamment de la taille de série", () => {
  assert.match(service, /Promise\.allSettled/);
  assert.match(service, /QR_REGISTRY/);
  assert.match(service, /MANIFEST_CANONICAL/);
  assert.doesNotMatch(service, /mapWithConcurrency|withTimeout/);
});
