import "server-only";

import type { PublicSiteAnalyticsPeriod } from "@/features/admin/public-site-analytics-types";
import { createPublicSiteAnalyticsReader } from "@/server/public-site-analytics-core";

const reader = createPublicSiteAnalyticsReader();

export function readPublicSiteAnalytics(period: PublicSiteAnalyticsPeriod) {
  return reader.read(period);
}
