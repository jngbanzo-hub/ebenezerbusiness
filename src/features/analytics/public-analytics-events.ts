"use client";

import { track } from "@vercel/analytics";

import {
  isPublicAnalyticsPath,
  type QrAnalyticsSource,
  type QrResolutionOutcome,
  type TrackingSearchOutcome
} from "@/features/analytics/public-analytics-policy";

const ANALYTICS_INIT_RETRY_MS = 50;
const ANALYTICS_INIT_MAX_RETRIES = 20;

type AnalyticsWindow = Window & {
  va?: (...params: unknown[]) => void;
};

function canTrackPublicEvent() {
  return typeof window !== "undefined" && isPublicAnalyticsPath(window.location.pathname);
}

function dispatchPublicEvent(
  name: string,
  properties: Record<string, string> | undefined,
  retriesLeft: number
) {
  if (!canTrackPublicEvent()) return;

  if (typeof (window as AnalyticsWindow).va !== "function" && retriesLeft > 0) {
    window.setTimeout(
      () => dispatchPublicEvent(name, properties, retriesLeft - 1),
      ANALYTICS_INIT_RETRY_MS
    );
    return;
  }

  try {
    track(name, properties);
  } catch {
    // Analytics must never alter or interrupt the public business flow.
  }
}

function sendPublicEvent(name: string, properties?: Record<string, string>) {
  dispatchPublicEvent(name, properties, ANALYTICS_INIT_MAX_RETRIES);
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
