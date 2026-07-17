import { NextResponse } from "next/server";

import { runControlledNotificationScenarios } from "@/server/notifications/notification-engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorizationError = authorizeNotificationTest(request);

  if (authorizationError) {
    return authorizationError;
  }

  if (process.env.NOTIFICATIONS_DRY_RUN === "false") {
    return NextResponse.json(
      {
        error: "Les scénarios contrôlés sont disponibles uniquement en dry-run."
      },
      {
        status: 403
      }
    );
  }

  const result = await runControlledNotificationScenarios();

  return NextResponse.json(result);
}

function authorizeNotificationTest(request: Request) {
  const expectedSecret = process.env.NOTIFICATIONS_SYNC_SECRET?.trim();

  if (!expectedSecret) {
    return NextResponse.json(
      {
        error: "NOTIFICATIONS_SYNC_SECRET manquant. Les tests restent désactivés."
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

  if (bearerToken !== expectedSecret) {
    return NextResponse.json(
      {
        error: "Tests non autorisés."
      },
      {
        status: 401
      }
    );
  }

  return null;
}
