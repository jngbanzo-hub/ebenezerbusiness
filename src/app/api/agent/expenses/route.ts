import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import {
  AgentExpenseRequestError,
  forwardAgentExpenseRequest
} from "@/server/agent-expenses-apps-script";
import { recordInternalNotification } from "@/server/internal-notifications";

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
    const command = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const details = command.donnees && typeof command.donnees === "object" && !Array.isArray(command.donnees) ? command.donnees as Record<string, unknown> : {};
    const response = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : {};
    if (command.action === "ENREGISTRER_DEPENSE" && response.replayed !== true && typeof details.expenseRequestId === "string") await recordInternalNotification({ eventKey: `EXPENSE:${details.expenseRequestId}`, agency: authorization.identity.site, type: "EXPENSE", title: "Dépense enregistrée", message: `${String(details.categorie ?? "Dépense")} — ${Number(details.montant ?? 0).toFixed(2)} ${String(details.devise ?? "")} — ${authorization.identity.nom}`, actorUserId: authorization.identity.userId, actorName: authorization.identity.nom }).catch(() => undefined);

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
