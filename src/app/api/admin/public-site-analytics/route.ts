import { NextResponse } from "next/server";

import { isPublicSiteAnalyticsPeriod } from "@/features/admin/public-site-analytics-types";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readPublicSiteAnalytics } from "@/server/public-site-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) {
      return json(
        { error: { code: authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" } },
        authorization.status
      );
    }

    const period = new URL(request.url).searchParams.get("period");
    if (!isPublicSiteAnalyticsPeriod(period)) {
      return json({ error: { code: "INVALID_PERIOD" } }, 400);
    }

    return json(await readPublicSiteAnalytics(period), 200);
  } catch {
    return json({ error: { code: "PUBLIC_SITE_ANALYTICS_UNAVAILABLE" } }, 503);
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
