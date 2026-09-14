export const PUBLIC_SITE_ANALYTICS_PERIODS = ["today", "7d", "30d"] as const;

export type PublicSiteAnalyticsPeriod =
  (typeof PUBLIC_SITE_ANALYTICS_PERIODS)[number];

export type PublicSiteAnalyticsPayload = Readonly<{
  status: "AVAILABLE";
  period: PublicSiteAnalyticsPeriod;
  range: Readonly<{
    since: string;
    until: string;
  }>;
  visitors: Readonly<{
    today: number;
    sevenDays: number;
    thirtyDays: number;
  }>;
  countries: Readonly<{
    benin: number;
    drc: number;
    other: number;
  }>;
  tracking: Readonly<{
    pageViews: number;
    searches: number;
    success: number;
    notFound: number;
    unavailable: number;
  }>;
  qr: Readonly<{
    scannerOpens: number;
    resolved: number;
    invalidOrUnknown: number;
    integrated: number;
    external: number;
  }>;
  devices: Readonly<{
    mobile: number;
    tablet: number;
    desktop: number;
  }>;
  trend: readonly Readonly<{
    timestamp: string;
    pageViews: number;
    visitors: number;
  }>[];
  checkedAt: string;
}>;

export function isPublicSiteAnalyticsPeriod(
  value: string | null
): value is PublicSiteAnalyticsPeriod {
  return PUBLIC_SITE_ANALYTICS_PERIODS.some((period) => period === value);
}
