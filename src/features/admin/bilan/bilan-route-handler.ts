import { NextResponse } from "next/server";

import type { AdminAuthorizationResult } from "@/server/admin-authorization";

import { parseBilanApiQuery, type BilanApiQuery } from "./bilan-api-query";

type AuthorizedAdmin = Extract<AdminAuthorizationResult, { authorized: true }>;

export function createBilanGetHandler(dependencies: Readonly<{
  authorize: (request: Request) => Promise<AdminAuthorizationResult>;
  build: (query: BilanApiQuery, admin: AuthorizedAdmin) => Promise<unknown>;
}>) {
  return async function GET(request: Request) {
    const startedAt = performance.now();
    try {
      const authorization = await dependencies.authorize(request);
      if (!authorization.authorized) return failure(authorization.status, authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", "Accès Admin refusé.");
      const parsed = parseBilanApiQuery(request.url);
      if (parsed.state === "INVALID") return failure(400, "INVALID_PARAMETERS", parsed.message);
      if (parsed.state === "COHORTE_NON_RESOLUE") return NextResponse.json({ code: "COHORTE_NON_RESOLUE", requested: parsed.requested, meta: { status: "NON_CALCULABLE" } }, { headers: headers() });
      const payload = await dependencies.build(parsed.query, authorization);
      return NextResponse.json(payload, { headers: headers() });
    } catch (cause) {
      console.error("[admin-bilan]", { type: cause instanceof Error ? cause.name : "UNKNOWN", durationMs: Math.round(performance.now() - startedAt) });
      return failure(503, "BILAN_SOURCE_UNAVAILABLE", "Le BILAN est temporairement indisponible.");
    }
  };
}

function failure(status: number, code: string, message: string) { return NextResponse.json({ error: { code, message } }, { status, headers: headers() }); }
function headers() { return { "Cache-Control": "private, no-store, max-age=0" }; }
