import { NextResponse } from "next/server";

import {
  resetNotificationStore,
  seedNotificationLogEntryForWebhookTest
} from "@/server/notifications/notification-store";
import { handleDialog360WebhookPayload } from "@/server/whatsapp/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mainMessageId = "wamid.WEBHOOK_STATUS_MAIN_001";
const failedMessageId = "wamid.WEBHOOK_STATUS_FAILED_001";

export async function POST(request: Request) {
  const authorizationError = authorizeWebhookTest(request);

  if (authorizationError) {
    return authorizationError;
  }

  if (process.env.NOTIFICATIONS_DRY_RUN === "false") {
    return NextResponse.json(
      {
        error: "Les tests webhook restent disponibles uniquement en dry-run."
      },
      {
        status: 403
      }
    );
  }

  if (process.env.WHATSAPP_WEBHOOK_TESTS_ENABLED !== "true") {
    return NextResponse.json(
      {
        error: "WHATSAPP_WEBHOOK_TESTS_ENABLED doit être true pour lancer les scénarios locaux."
      },
      {
        status: 403
      }
    );
  }

  const store = resetNotificationStore();
  seedNotificationLogEntryForWebhookTest({
    dedupKey: "webhook-test-main",
    messageId: mainMessageId
  });
  seedNotificationLogEntryForWebhookTest({
    dedupKey: "webhook-test-failed",
    messageId: failedMessageId
  });

  const scenarios = [
    {
      name: "sent",
      result: await handleDialog360WebhookPayload(buildStatusPayload(mainMessageId, "sent"))
    },
    {
      name: "delivered",
      result: await handleDialog360WebhookPayload(buildStatusPayload(mainMessageId, "delivered"))
    },
    {
      name: "read",
      result: await handleDialog360WebhookPayload(buildStatusPayload(mainMessageId, "read"))
    },
    {
      name: "duplicate read",
      result: await handleDialog360WebhookPayload(buildStatusPayload(mainMessageId, "read"))
    },
    {
      name: "downgrade read to delivered",
      result: await handleDialog360WebhookPayload(buildStatusPayload(mainMessageId, "delivered"))
    },
    {
      name: "failed",
      result: await handleDialog360WebhookPayload(
        buildStatusPayload(failedMessageId, "failed", {
          code: 131026,
          title: "Message undeliverable"
        })
      )
    },
    {
      name: "unknown messageId",
      result: await handleDialog360WebhookPayload(buildStatusPayload("wamid.UNKNOWN_MESSAGE_001", "sent"))
    },
    {
      name: "unknown event",
      result: await handleDialog360WebhookPayload({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: "wamid.INBOUND_IGNORED_001",
                      type: "text"
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    }
  ];

  return NextResponse.json({
    ok: true,
    dryRun: true,
    scenarios,
    finalEntries: store.list()
  });
}

function authorizeWebhookTest(request: Request) {
  const expectedSecret = process.env.DIALOG360_WEBHOOK_SECRET?.trim();

  if (!expectedSecret) {
    return NextResponse.json(
      {
        error: "DIALOG360_WEBHOOK_SECRET manquant. Les tests webhook restent désactivés."
      },
      {
        status: 403
      }
    );
  }

  const receivedSecret =
    request.headers.get("x-webhook-secret")?.trim() ??
    new URL(request.url).searchParams.get("secret")?.trim() ??
    "";

  if (receivedSecret !== expectedSecret) {
    return NextResponse.json(
      {
        error: "Tests webhook non autorisés."
      },
      {
        status: 401
      }
    );
  }

  return null;
}

function buildStatusPayload(
  messageId: string,
  status: "sent" | "delivered" | "read" | "failed",
  error?: {
    code: number;
    title: string;
  }
) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                {
                  id: messageId,
                  status,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  recipient_id: "229***46",
                  errors: error ? [error] : undefined
                }
              ]
            }
          }
        ]
      }
    ]
  };
}
