import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { extractEebQrId } from "./encaissement-qr-contract.ts";

test("accepte un identifiant QR EEB canonique", () => {
  assert.equal(extractEebQrId("EEBQR000001"), "EEBQR000001");
  assert.equal(extractEebQrId(" eebqr000125 "), "EEBQR000125");
});

test("extrait un identifiant QR EEB depuis une URL officielle future", () => {
  assert.equal(
    extractEebQrId("https://ebenezerbusiness.com/qr/EEBQR000125"),
    "EEBQR000125"
  );
  assert.equal(
    extractEebQrId("https://ebenezerbusiness.com/qr?id=EEBQR000002"),
    "EEBQR000002"
  );
});

test("refuse les contenus inconnus ou malformés", () => {
  assert.equal(extractEebQrId("AT19326B"), null);
  assert.equal(extractEebQrId("EEBQR125"), null);
  assert.equal(extractEebQrId("texte EEBQR000001"), null);
  assert.equal(extractEebQrId("javascript:EEBQR000001"), null);
});

test("le scanner reste isolé de la recherche et du paiement métier", async () => {
  const source = await readFile(
    new URL("./encaissement-qr-scanner.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(source, /import\("@zxing\/browser"\)/);
  assert.match(source, /track\.stop\(\)/);
  assert.doesNotMatch(source, /savePayment|saveDestinationPayment|searchParcel|searchDestinationParcel/);
});
