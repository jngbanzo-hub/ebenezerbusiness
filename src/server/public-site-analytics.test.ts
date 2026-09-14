import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { createPublicSiteAnalyticsReader } from "./public-site-analytics-core.ts";

const NOW = new Date("2026-09-14T12:00:00.000Z");
const ENVIRONMENT = {
  VERCEL_ANALYTICS_TOKEN: "unit-token",
  VERCEL_ANALYTICS_PROJECT_ID: "test-project",
  VERCEL_ANALYTICS_TEAM_SLUG: "test-team"
};

test("agrège visiteurs, pays, suivi, QR et appareils sans double compter l'événement page", async () => {
  const urls: URL[] = [];
  const reader = createPublicSiteAnalyticsReader({
    environment: ENVIRONMENT,
    now: () => NOW,
    fetcher: async (input) => {
      const url = new URL(String(input));
      urls.push(url);
      return jsonResponse(mockRows(url));
    }
  });

  const payload = await reader.read("7d");
  assert.deepEqual(payload.visitors, { today: 3, sevenDays: 12, thirtyDays: 30 });
  assert.deepEqual(payload.countries, { benin: 5, drc: 4, other: 3 });
  assert.deepEqual(payload.devices, { mobile: 7, tablet: 1, desktop: 4 });
  assert.deepEqual(payload.tracking, {
    pageViews: 9,
    searches: 8,
    success: 5,
    notFound: 2,
    unavailable: 1
  });
  assert.deepEqual(payload.qr, {
    scannerOpens: 6,
    resolved: 4,
    invalidOrUnknown: 2,
    integrated: 5,
    external: 1
  });
  assert.equal(payload.trend.length, 2);

  const trackingPageQuery = urls.find(
    (url) => url.searchParams.get("filter") === "requestPath eq '/suivi-de-colis'"
  );
  assert.ok(trackingPageQuery, "la route /suivi-de-colis doit être la seule source de son KPI");
  assert.equal(trackingPageQuery.pathname.endsWith("/visits/count"), true);
  assert.equal(
    urls.filter((url) => url.pathname.endsWith("/aggregate")).every((url) => url.searchParams.has("by")),
    true
  );
  assert.equal(
    urls.filter((url) => url.pathname.endsWith("/count")).every((url) => !url.searchParams.has("by")),
    true
  );
  assert.equal(
    urls.some((url) => url.searchParams.get("filter")?.includes("tracking_page_view")),
    false
  );
  assert.equal(JSON.stringify(payload).includes(ENVIRONMENT.VERCEL_ANALYTICS_TOKEN), false);
});

test("envoie le token uniquement dans Authorization et cible le projet/équipe serveur", async () => {
  const capturedUrls: URL[] = [];
  const capturedHeaders: Headers[] = [];
  const reader = createPublicSiteAnalyticsReader({
    environment: ENVIRONMENT,
    now: () => NOW,
    fetcher: async (input, init) => {
      capturedUrls.push(new URL(String(input)));
      capturedHeaders.push(new Headers(init?.headers));
      return jsonResponse([]);
    }
  });

  await reader.read("today");
  const capturedUrl = capturedUrls[0];
  const capturedHeader = capturedHeaders[0];
  assert.ok(capturedUrl);
  assert.ok(capturedHeader);
  assert.equal(capturedUrl.searchParams.get("projectId"), "test-project");
  assert.equal(capturedUrl.searchParams.get("slug"), "test-team");
  assert.equal(capturedUrl.toString().includes("test-token"), false);
  assert.equal(capturedHeader.get("Authorization"), "Bearer unit-token");
});

test("déduplique les lectures concurrentes et garde le cache cinq minutes", async () => {
  let calls = 0;
  const reader = createPublicSiteAnalyticsReader({
    environment: ENVIRONMENT,
    now: () => NOW,
    fetcher: async () => {
      calls += 1;
      return jsonResponse([]);
    }
  });

  const [first, second] = await Promise.all([reader.read("30d"), reader.read("30d")]);
  assert.strictEqual(first, second);
  assert.equal(calls, 12);
  await reader.read("30d");
  assert.equal(calls, 12);
});

test("échoue fermé si le token manque ou si Vercel refuse une requête", async () => {
  const withoutToken = createPublicSiteAnalyticsReader({
    environment: {},
    now: () => NOW,
    fetcher: async () => assert.fail("aucun appel ne doit partir sans token")
  });
  await assert.rejects(() => withoutToken.read("today"), /temporairement indisponibles/i);

  const rejected = createPublicSiteAnalyticsReader({
    environment: ENVIRONMENT,
    now: () => NOW,
    fetcher: async () => new Response("refused", { status: 403 })
  });
  await assert.rejects(() => rejected.read("today"), /temporairement indisponibles/i);
});

function mockRows(url: URL) {
  const dataset = url.pathname.includes("/events/") ? "events" : "visits";
  const rawBy = url.searchParams.getAll("by");
  const by = rawBy;
  const filter = url.searchParams.get("filter") ?? "";
  const since = url.searchParams.get("since") ?? "";

  if (dataset === "visits" && by.includes("country")) {
    return [
      { country: "BJ", visitors: 5 },
      { country: "CD", visitors: 4 },
      { country: "FR", visitors: 2 },
      { country: "Others", visitors: 1 }
    ];
  }
  if (dataset === "visits" && by.includes("deviceType")) {
    return [
      { deviceType: "Mobile", visitors: 7 },
      { deviceType: "Tablet", visitors: 1 },
      { deviceType: "Desktop", visitors: 4 }
    ];
  }
  if (dataset === "visits" && (by.includes("day") || by.includes("hour"))) {
    return [
      { timestamp: "2026-09-13T00:00:00.000Z", pageviews: 4, visitors: 3 },
      { timestamp: "2026-09-14T00:00:00.000Z", pageviews: 7, visitors: 5 }
    ];
  }
  if (dataset === "visits" && filter.includes("/suivi-de-colis")) {
    return { pageviews: 9, visitors: 7 };
  }
  if (dataset === "visits") {
    if (since.startsWith("2026-09-13")) return { visitors: 3, pageviews: 5 };
    if (since.startsWith("2026-09-07")) return { visitors: 12, pageviews: 20 };
    return { visitors: 30, pageviews: 55 };
  }
  if (filter.includes("tracking_search") && by.includes("eventData/outcome")) {
    return [
      { eventData: "success", count: 5 },
      { eventData: "not_found", count: 2 },
      { eventData: "unavailable", count: 1 }
    ];
  }
  if (filter.includes("tracking_search")) return { count: 8, visitors: 6 };
  if (filter.includes("qr_scanner_open")) return { count: 6, visitors: 4 };
  if (by.includes("eventData/outcome")) {
    return [
      { eventData: "success", count: 4 },
      { eventData: "invalid", count: 1 },
      { eventData: "unknown", count: 1 }
    ];
  }
  if (by.includes("eventData/source")) {
    return [
      { eventData: "integrated", count: 5 },
      { eventData: "external", count: 1 }
    ];
  }
  return [];
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ version: 1, query: {}, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
