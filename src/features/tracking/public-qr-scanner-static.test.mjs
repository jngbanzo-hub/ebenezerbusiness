import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scanner = readFileSync(new URL("./public-qr-scanner.tsx", import.meta.url), "utf8");
const tracking = readFileSync(new URL("./parcel-tracking.tsx", import.meta.url), "utf8");

test("le scanner accepte uniquement le QR canonique ou son URL officielle", () => {
  assert.match(scanner, /\^EEBQR\[0-9\]\{6,\}\$/);
  assert.match(scanner, /url\.hostname !== "www\.ebenezerbusiness\.com"/);
  assert.ok(scanner.includes("url.pathname.match(/^\\/q\\/(EEBQR[0-9]{6,})\\/?$/)"));
  assert.match(scanner, /url\.search !== ""/);
  assert.match(scanner, /url\.hash !== ""/);
});

test("la caméra arrière, le refus, la fermeture et l'arrêt des pistes sont gérés", () => {
  assert.match(scanner, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(scanner, /import\("@zxing\/browser"\)/);
  assert.match(scanner, /facingMode: \{ ideal: "environment" \}/);
  assert.match(scanner, /video\.setAttribute\("playsinline", "true"\)/);
  assert.match(scanner, /video\.setAttribute\("muted", "true"\)/);
  assert.match(scanner, /video\.setAttribute\("autoplay", "true"\)/);
  assert.match(scanner, /CAMERA_START_TIMEOUT/);
  assert.match(scanner, /CAMERA_PERMISSION_TIMEOUT/);
  assert.match(scanner, /CAMERA_METADATA_TIMEOUT/);
  assert.match(scanner, /CAMERA_FRAME_TIMEOUT/);
  assert.match(scanner, /video\.readyState >= HTMLMediaElement\.HAVE_CURRENT_DATA/);
  assert.match(scanner, /video\.videoWidth > 0/);
  assert.match(scanner, /video\.videoHeight > 0/);
  assert.match(scanner, /video\.srcObject === stream/);
  assert.match(scanner, /requestStream\(true\)/);
  assert.match(scanner, /lateStream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(scanner, /track\.stop\(\)/);
  assert.match(scanner, /sessionRef\.current !== session/);
  assert.match(scanner, /aria-label="Fermer le scanner"/);
  assert.match(scanner, /handledRef\.current/);
  assert.match(scanner, /Impossible d’ouvrir la caméra\. Vérifiez l’autorisation caméra de votre navigateur puis réessayez\./);
});

test("le scan appelle seulement le résolveur public sans workflow métier", () => {
  assert.match(scanner, /fetch\(`\/api\/qr\/\$\{encodeURIComponent\(qrId\)\}`/);
  assert.match(scanner, /cache: "no-store"/);
  assert.doesNotMatch(`${scanner}\n${tracking}`, /api\/agent|Encaissement|savePayment|Stockage|MANIFESTE|EXPÉDITION/);
});

test("la recherche manuelle reste présente et ASSIGNED réutilise TrackingResultCard", () => {
  assert.match(tracking, /onSubmit=\{handleSubmit\(onSubmit\)\}/);
  assert.match(tracking, /trackingSite/);
  assert.match(tracking, /trackingCode/);
  assert.match(tracking, /<TrackingResultCard result=\{result\}/);
  assert.match(tracking, /resolution\.state === "ASSIGNED"/);
  assert.match(tracking, /QR Eben Ezer Business valide — association au colis en attente\./);
});
