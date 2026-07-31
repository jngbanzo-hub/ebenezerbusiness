import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import {
  AgentExpenseRequestError,
  forwardAgentExpenseRequest
} from "@/server/agent-expenses-apps-script";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authorization = await authorizeAgentRequest(request);
    if (!authorization.authorized) {
      return jsonError(
        authorization.status === 401
          ? "Session invalide ou expirée."
          : "Accès interdit.",
        authorization.status
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const result = await forwardAgentExpenseRequest(
      authorization.identity,
      body
    );

    return NextResponse.json(result, {
      headers: privateNoStoreHeaders()
    });
  } catch (error) {
    if (error instanceof AgentExpenseRequestError) {
      return jsonError(error.message, error.status);
    }

    return jsonError(
      "Le service Dépenses est temporairement indisponible.",
      503
    );
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, message },
    { status, headers: privateNoStoreHeaders() }
  );
}

function privateNoStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0"
  };
}
