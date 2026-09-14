"use client";

import { track } from "@vercel/analytics";

import {
  isPublicAnalyticsPath,
  type QrAnalyticsSource,
  type QrResolutionOutcome,
  type TrackingSearchOutcome
} from "@/features/analytics/public-analytics-policy";

function canTrackPublicEvent() {
  return typeof window !== "undefined" && isPublicAnalyticsPath(window.location.pathname);
}

function sendPublicEvent(name: string, properties?: Record<string, string>) {
  if (!canTrackPublicEvent()) return;

  try {
    track(name, properties);
  } catch {
    // Analytics must never alter or interrupt the public business flow.
  }
}

export function trackTrackingPageView() {
  sendPublicEvent("tracking_page_view");
}

export function trackTrackingSearch(outcome: TrackingSearchOutcome) {
  sendPublicEvent("tracking_search", { source: "manual", outcome });
}

export function trackQrScannerOpen() {
  sendPublicEvent("qr_scanner_open");
}

export function trackQrResolution(source: QrAnalyticsSource, outcome: QrResolutionOutcome) {
  sendPublicEvent("qr_resolution", { source, outcome });
}
