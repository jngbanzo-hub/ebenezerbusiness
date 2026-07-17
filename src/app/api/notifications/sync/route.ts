import { NextResponse } from "next/server";

import { scanPublicManifestNotifications } from "@/server/notifications/notification-engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorizationError = authorizeNotificationSync(request);

  if (authorizationError) {
    return authorizationError;
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  const includePayloadExamples = url.searchParams.get("includePayloadExamples") === "true";
  const result = await scanPublicManifestNotifications({
    limit: Number.isFinite(limit) ? limit : undefined,
    includePayloadExamples
  });

  return NextResponse.json(result);
}

function authorizeNotificationSync(request: Request) {
  const expectedSecret = process.env.NOTIFICATIONS_SYNC_SECRET?.trim();

  if (!expectedSecret) {
    return NextResponse.json(
      {
        error: "NOTIFICATIONS_SYNC_SECRET manquant. La synchronisation reste désactivée."
      },
      {
        status: 403
      }
    );
  }

  const authorizationHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : "";
  const directToken = request.headers.get("x-notifications-sync-secret")?.trim() ?? "";

  if (bearerToken !== expectedSecret && directToken !== expectedSecret) {
    return NextResponse.json(
      {
        error: "Synchronisation non autorisée."
      },
      {
        status: 401
      }
    );
  }

  return null;
}
