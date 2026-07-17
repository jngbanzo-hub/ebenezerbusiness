import { NextResponse } from "next/server";

import {
  handleDialog360WebhookPayload,
  type Dialog360WebhookPayload
} from "@/server/whatsapp/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorizationError = authorizeWebhook(request);

  if (authorizationError) {
    return authorizationError;
  }

  const payload = (await request.json().catch(() => ({}))) as Dialog360WebhookPayload;
  const result = await handleDialog360WebhookPayload(payload);

  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    webhook: "360dialog",
    dryRun: process.env.NOTIFICATIONS_DRY_RUN !== "false"
  });
}

function authorizeWebhook(request: Request) {
  const expectedSecret = process.env.DIALOG360_WEBHOOK_SECRET?.trim();

  if (!expectedSecret) {
    return NextResponse.json(
      {
        error: "DIALOG360_WEBHOOK_SECRET manquant. Le webhook reste désactivé."
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
        error: "Webhook non autorisé."
      },
      {
        status: 401
      }
    );
  }

  return null;
}
