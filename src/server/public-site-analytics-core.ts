import { z } from "zod";

import type {
  PublicSiteAnalyticsPayload,
  PublicSiteAnalyticsPeriod
} from "../features/admin/public-site-analytics-types";

const VERCEL_ANALYTICS_API = "https://api.vercel.com/v1/query/web-analytics";
const DEFAULT_PROJECT = "ebenezerbusiness";
const DEFAULT_TEAM_SLUG = "ebenezerbusiness";
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const BUSINESS_TIMEZONE_OFFSET_MS = 60 * 60 * 1000;

const aggregateRowSchema = z.record(z.unknown());
const analyticsResponseSchema = z.object({
  data: z.union([aggregateRowSchema, z.array(aggregateRowSchema)])
});

type AggregateDataset = "visits" | "events";
type FetchLike = typeof fetch;
type Environment = Readonly<Record<string, string | undefined>>;
type ReaderOptions = Readonly<{
  fetcher?: FetchLike;
  environment?: Environment;
  now?: () => Date;
  cacheTtlMs?: number;
}>;
type Query = Readonly<{
  dataset: AggregateDataset;
  since: string;
  until: string;
  by?: readonly string[];
  filter?: string;
  limit?: number;
}>;

export class PublicSiteAnalyticsUnavailableError extends Error {
  constructor() {
    super("Statistiques du site public temporairement indisponibles.");
    this.name = "PublicSiteAnalyticsUnavailableError";
  }
}

export function createPublicSiteAnalyticsReader(options: ReaderOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const environment = options.environment ?? process.env;
  const now = options.now ?? (() => new Date());
  const cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
  const cache = new Map<
    PublicSiteAnalyticsPeriod,
    { expiresAt: number; payload: PublicSiteAnalyticsPayload }
  >();
  const pending = new Map<PublicSiteAnalyticsPeriod, Promise<PublicSiteAnalyticsPayload>>();

  async function read(period: PublicSiteAnalyticsPeriod) {
    const currentTime = now();
    const cached = cache.get(period);
    if (cached && cached.expiresAt > currentTime.getTime()) return cached.payload;

    const existing = pending.get(period);
    if (existing) return existing;

    const request = buildPayload(period, currentTime, environment, fetcher)
      .then((payload) => {
        cache.set(period, {
          expiresAt: now().getTime() + cacheTtlMs,
          payload
        });
        return payload;
      })
      .finally(() => pending.delete(period));

    pending.set(period, request);
    return request;
  }

  return Object.freeze({ read });
}

async function buildPayload(
  period: PublicSiteAnalyticsPeriod,
  currentTime: Date,
  environment: Environment,
  fetcher: FetchLike
): Promise<PublicSiteAnalyticsPayload> {
  const config = readConfig(environment);
  const selectedRange = periodRange(period, currentTime);
  const ranges = {
    today: periodRange("today", currentTime),
    sevenDays: periodRange("7d", currentTime),
    thirtyDays: periodRange("30d", currentTime)
  } as const;

  try {
    const [
      todayRows,
      sevenDayRows,
      thirtyDayRows,
      trendRows,
      countryRows,
      deviceRows,
      trackingPageRows,
      trackingSearchRows,
      trackingOutcomeRows,
      scannerRows,
      qrOutcomeRows,
      qrSourceRows
    ] = await Promise.all([
      queryAggregate(config, fetcher, { dataset: "visits", ...ranges.today }),
      queryAggregate(config, fetcher, { dataset: "visits", ...ranges.sevenDays }),
      queryAggregate(config, fetcher, { dataset: "visits", ...ranges.thirtyDays }),
      queryAggregate(config, fetcher, {
        dataset: "visits",
        ...selectedRange,
        by: [period === "today" ? "hour" : "day"],
        limit: period === "30d" ? 31 : 24
      }),
      queryAggregate(config, fetcher, {
        dataset: "visits",
        ...selectedRange,
        by: ["country"],
        limit: 100
      }),
      queryAggregate(config, fetcher, {
        dataset: "visits",
        ...selectedRange,
        by: ["deviceType"],
        limit: 20
      }),
      queryAggregate(config, fetcher, {
        dataset: "visits",
        ...selectedRange,
        filter: "requestPath eq '/suivi-de-colis'"
      }),
      queryAggregate(config, fetcher, {
        dataset: "events",
        ...selectedRange,
        filter: "eventName eq 'tracking_search' and eventData/source eq 'manual'"
      }),
      queryAggregate(config, fetcher, {
        dataset: "events",
        ...selectedRange,
        by: ["eventData/outcome"],
        filter: "eventName eq 'tracking_search' and eventData/source eq 'manual'",
        limit: 10
      }),
      queryAggregate(config, fetcher, {
        dataset: "events",
        ...selectedRange,
        filter: "eventName eq 'qr_scanner_open'"
      }),
      queryAggregate(config, fetcher, {
        dataset: "events",
        ...selectedRange,
        by: ["eventData/outcome"],
        filter: "eventName eq 'qr_resolution'",
        limit: 10
      }),
      queryAggregate(config, fetcher, {
        dataset: "events",
        ...selectedRange,
        by: ["eventData/source"],
        filter: "eventName eq 'qr_resolution'",
        limit: 10
      })
    ]);

    const countries = groupCounts(countryRows, "country", "visitors");
    const devices = groupCounts(deviceRows, "deviceType", "visitors", true);
    const trackingOutcomes = groupCounts(trackingOutcomeRows, "eventData", "count", true);
    const qrOutcomes = groupCounts(qrOutcomeRows, "eventData", "count", true);
    const qrSources = groupCounts(qrSourceRows, "eventData", "count", true);

    return Object.freeze({
      status: "AVAILABLE" as const,
      period,
      range: selectedRange,
      visitors: Object.freeze({
        today: total(todayRows, "visitors"),
        sevenDays: total(sevenDayRows, "visitors"),
        thirtyDays: total(thirtyDayRows, "visitors")
      }),
      countries: Object.freeze({
        benin: countries.get("BJ") ?? 0,
        drc: countries.get("CD") ?? 0,
        other: sumMapExcept(countries, new Set(["BJ", "CD"]))
      }),
      tracking: Object.freeze({
        pageViews: total(trackingPageRows, "pageviews"),
        searches: total(trackingSearchRows, "count"),
        success: trackingOutcomes.get("success") ?? 0,
        notFound: trackingOutcomes.get("not_found") ?? 0,
        unavailable: trackingOutcomes.get("unavailable") ?? 0
      }),
      qr: Object.freeze({
        scannerOpens: total(scannerRows, "count"),
        resolved: qrOutcomes.get("success") ?? 0,
        invalidOrUnknown:
          (qrOutcomes.get("invalid") ?? 0) + (qrOutcomes.get("unknown") ?? 0),
        integrated: qrSources.get("integrated") ?? 0,
        external: qrSources.get("external") ?? 0
      }),
      devices: Object.freeze({
        mobile: devices.get("mobile") ?? 0,
        tablet: devices.get("tablet") ?? 0,
        desktop: devices.get("desktop") ?? 0
      }),
      trend: Object.freeze(
        trendRows
          .map((row) => ({
            timestamp: textValue(row.timestamp),
            pageViews: numericValue(row.pageviews),
            visitors: numericValue(row.visitors)
          }))
          .filter((row) => row.timestamp)
      ),
      checkedAt: currentTime.toISOString()
    });
  } catch (error) {
    if (error instanceof PublicSiteAnalyticsUnavailableError) throw error;
    throw new PublicSiteAnalyticsUnavailableError();
  }
}

type VercelConfig = Readonly<{
  token: string;
  projectId: string;
  teamId?: string;
  teamSlug?: string;
}>;

function readConfig(environment: Environment): VercelConfig {
  const token = environment.VERCEL_ANALYTICS_TOKEN?.trim();
  if (!token) throw new PublicSiteAnalyticsUnavailableError();

  const projectId =
    environment.VERCEL_ANALYTICS_PROJECT_ID?.trim() ||
    environment.VERCEL_PROJECT_ID?.trim() ||
    DEFAULT_PROJECT;
  const teamId =
    environment.VERCEL_ANALYTICS_TEAM_ID?.trim() || environment.VERCEL_TEAM_ID?.trim();
  const teamSlug = teamId
    ? undefined
    : environment.VERCEL_ANALYTICS_TEAM_SLUG?.trim() || DEFAULT_TEAM_SLUG;

  return Object.freeze({ token, projectId, teamId, teamSlug });
}

async function queryAggregate(
  config: VercelConfig,
  fetcher: FetchLike,
  query: Query
): Promise<z.infer<typeof aggregateRowSchema>[]> {
  const endpoint = query.by?.length ? "aggregate" : "count";
  const url = new URL(`${VERCEL_ANALYTICS_API}/${query.dataset}/${endpoint}`);
  url.searchParams.set("projectId", config.projectId);
  if (query.by?.length) {
    for (const dimension of query.by) url.searchParams.append("by", dimension);
  }
  url.searchParams.set("since", query.since);
  url.searchParams.set("until", query.until);
  if (query.limit) url.searchParams.set("limit", String(query.limit));
  if (query.filter) url.searchParams.set("filter", query.filter);
  if (config.teamId) url.searchParams.set("teamId", config.teamId);
  else if (config.teamSlug) url.searchParams.set("slug", config.teamSlug);

  const response = await fetcher(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) throw new PublicSiteAnalyticsUnavailableError();
  const parsed = analyticsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new PublicSiteAnalyticsUnavailableError();
  return Array.isArray(parsed.data.data) ? parsed.data.data : [parsed.data.data];
}

function periodRange(period: PublicSiteAnalyticsPeriod, now: Date) {
  const local = new Date(now.getTime() + BUSINESS_TIMEZONE_OFFSET_MS);
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const since = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - days + 1) -
      BUSINESS_TIMEZONE_OFFSET_MS
  );
  return Object.freeze({ since: since.toISOString(), until: now.toISOString() });
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function total(rows: readonly z.infer<typeof aggregateRowSchema>[], key: string) {
  return rows.reduce((sum, row) => sum + numericValue(row[key]), 0);
}

function groupCounts(
  rows: readonly z.infer<typeof aggregateRowSchema>[],
  dimension: string,
  metric: string,
  lowercase = false
) {
  const result = new Map<string, number>();
  for (const row of rows) {
    const rawKey = textValue(row[dimension]);
    if (!rawKey) continue;
    const key = lowercase ? rawKey.toLowerCase() : rawKey.toUpperCase();
    result.set(key, (result.get(key) ?? 0) + numericValue(row[metric]));
  }
  return result;
}

function sumMapExcept(values: ReadonlyMap<string, number>, excluded: ReadonlySet<string>) {
  let sum = 0;
  values.forEach((value, key) => {
    if (!excluded.has(key)) sum += value;
  });
  return sum;
}
