"use client";

import { useEffect, useRef } from "react";

import { trackQrResolution } from "@/features/analytics/public-analytics-events";
import { qrResolutionOutcome } from "@/features/analytics/public-analytics-policy";

export function ExternalQrAnalytics({ state }: { state: string }) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    trackQrResolution("external", qrResolutionOutcome(state));
  }, [state]);

  return null;
}
