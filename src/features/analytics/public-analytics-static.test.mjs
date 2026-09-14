import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const analytics = readFileSync(new URL("./public-analytics.tsx", import.meta.url), "utf8");
const events = readFileSync(new URL("./public-analytics-events.ts", import.meta.url), "utf8");
const external = readFileSync(new URL("./external-qr-analytics.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
const tracking = readFileSync(new URL("../tracking/parcel-tracking.tsx", import.meta.url), "utf8");
const scanner = readFileSync(new URL("../tracking/public-qr-scanner.tsx", import.meta.url), "utf8");
const qrPage = readFileSync(new URL("../../app/q/[qrId]/page.tsx", import.meta.url), "utf8");

test("le collecteur global est bloqué hors liste blanche publique", () => {
  assert.match(layout, /<PublicAnalytics \/>/);
  assert.ok(layout.indexOf("<PublicAnalytics />") < layout.indexOf("{children}"));
  assert.match(analytics, /if \(!isPublicAnalyticsPath\(pathname\)\) return null/);
  assert.match(analytics, /beforeSend=.*sanitizePublicAnalyticsEvent/);
});

test("seuls les quatre événements publics et leurs propriétés fermées sont émis", () => {
  for (const event of ["tracking_page_view", "tracking_search", "qr_scanner_open", "qr_resolution"]) {
    assert.match(events, new RegExp(`sendPublicEvent\\(\"${event}\"`));
  }
  assert.match(events, /\{ source: "manual", outcome \}/);
  assert.match(events, /\{ source, outcome \}/);
  assert.doesNotMatch(events, /(?:trackingCode|tracking_code|qrId|phone|email|weight|beneficiary|sender)\s*:/i);
});

test("la recherche et le scanner émettent sans changer leurs appels métier", () => {
  assert.match(analytics, /pathname !== "\/suivi-de-colis".*window\.setTimeout\(trackTrackingPageView, 0\)/s);
  assert.match(tracking, /trackTrackingSearch\(trackingSearchOutcome\(response\.status, payload\.found\)\)/);
  assert.match(tracking, /trackQrResolution\("integrated", qrResolutionOutcome\(resolution\.state\)\)/);
  assert.match(scanner, /trackQrScannerOpen\(\)/);
  assert.match(tracking, /fetch\(`\/api\/tracking\/\$\{encodeURIComponent\(values\.trackingCode\)\}/);
  assert.match(scanner, /fetch\(`\/api\/qr\/\$\{encodeURIComponent\(qrId\)\}`/);
});

test("le QR externe transmet seulement son état et jamais son identifiant au composant Analytics", () => {
  assert.match(qrPage, /<ExternalQrAnalytics state=\{resolution\.state\} \/>/);
  assert.match(external, /trackQrResolution\("external", qrResolutionOutcome\(state\)\)/);
  assert.doesNotMatch(external, /qrId|params|trackingCode/);
});

test("aucune primitive d'écriture métier n'est introduite par Analytics", () => {
  const combined = `${analytics}\n${events}\n${external}`;
  assert.doesNotMatch(combined, /method:\s*["'](?:POST|PUT|PATCH|DELETE)|\.insert\(|\.update\(|\.upsert\(|\.delete\(|cash_event|storage_event|paymentRequestId/i);
});
