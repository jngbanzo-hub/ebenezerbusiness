"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { trackTrackingPageView } from "@/features/analytics/public-analytics-events";
import {
  isPublicAnalyticsPath,
  sanitizePublicAnalyticsEvent
} from "@/features/analytics/public-analytics-policy";

export function PublicAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/suivi-de-colis") trackTrackingPageView();
  }, [pathname]);

  if (!isPublicAnalyticsPath(pathname)) return null;

  return (
    <Analytics
      debug={false}
      beforeSend={(event: BeforeSendEvent) => sanitizePublicAnalyticsEvent(event)}
    />
  );
}
