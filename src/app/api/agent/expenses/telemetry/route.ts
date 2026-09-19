import { authorizeAgentRequest } from "@/server/agent-authorization";
import { persistExpenseFrontendTelemetry } from "@/server/expense-performance-telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = await authorizeAgentRequest(request);
  if (!authorization.authorized) return Response.json({ accepted: false }, { status: authorization.status });
  const body = await request.json().catch(() => null);
  if (!valid(body)) return Response.json({ accepted: false }, { status: 400 });
  await persistExpenseFrontendTelemetry({ requestId: body.expenseRequestId, agency: authorization.identity.site, metrics: body.metrics }).catch(() => false);
  return Response.json({ accepted: true }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

function valid(value: unknown): value is { expenseRequestId: string; metrics: Record<string, number> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.expenseRequestId !== "string" || !/^[0-9a-f-]{36}$/i.test(row.expenseRequestId)) return false;
  if (!row.metrics || typeof row.metrics !== "object" || Array.isArray(row.metrics)) return false;
  const allowed = new Set(["clickToFetch", "fetchToResponse", "responseToSetResult", "setResultToRendered", "clickToRendered"]);
  return Object.entries(row.metrics as Record<string, unknown>).every(([key, item]) => allowed.has(key) && typeof item === "number" && Number.isFinite(item) && item >= 0 && item < 120_000);
}
