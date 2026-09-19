import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
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

    const { userId, email, nom, role, agence, site, lastSignInAt } = authorization.identity;
    return NextResponse.json(
      { id: userId, email, nom, role, agence, site, actif: true, lastSignInAt },
      { headers: privateNoStoreHeaders() }
    );
  } catch {
    return jsonError("Le profil Agent est temporairement indisponible.", 503);
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { message },
    { status, headers: privateNoStoreHeaders() }
  );
}

function privateNoStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0"
  };
}
