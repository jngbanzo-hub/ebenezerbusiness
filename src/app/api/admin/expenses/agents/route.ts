import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readActiveExpenseAgents } from "@/server/admin-expense-agents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) {
      return response(
        { error: { code: authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: "Accès Admin refusé." } },
        authorization.status
      );
    }

    return response({
      success: true,
      code: "ACTIVE_EXPENSE_AGENTS_LISTED",
      readOnly: true,
      agents: await readActiveExpenseAgents()
    });
  } catch {
    return response(
      { error: { code: "ACTIVE_EXPENSE_AGENTS_UNAVAILABLE", message: "Lecture des Agents indisponible." } },
      503
    );
  }
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
