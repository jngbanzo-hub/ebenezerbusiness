"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";

import {
  isPublicAnalyticsPath,
  sanitizePublicAnalyticsEvent
} from "@/features/analytics/public-analytics-policy";

export function PublicAnalytics() {
  const pathname = usePathname();

  if (!isPublicAnalyticsPath(pathname)) return null;

  return (
    <Analytics
      debug={false}
      beforeSend={(event: BeforeSendEvent) => sanitizePublicAnalyticsEvent(event)}
    />
  );
}
