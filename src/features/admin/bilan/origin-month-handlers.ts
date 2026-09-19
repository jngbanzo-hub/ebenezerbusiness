import { NextResponse } from "next/server";
import { z } from "zod";
import type { AdminAuthorizationResult } from "@/server/admin-authorization";
import type { OriginMonth } from "./cohort-catalog";

const createSchema = z.object({ prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,8}$/), year: z.number().int().min(2000).max(2199), month: z.number().int().min(1).max(12), label: z.string().trim().min(1).max(80) }).strict();
const updateSchema = z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(80), active: z.boolean() }).strict();

export function createOriginMonthHandlers(deps: {
  authorize: (request: Request) => Promise<AdminAuthorizationResult>;
  read: () => Promise<readonly OriginMonth[]>;
  create: (input: z.infer<typeof createSchema>, actor: string) => Promise<void>;
  update: (input: z.infer<typeof updateSchema>, actor: string) => Promise<void>;
}) {
  const headers = { "Cache-Control": "private, no-store" };
  async function handle(request: Request, method: "GET" | "POST" | "PATCH") {
    try {
      const auth = await deps.authorize(request);
      if (!auth.authorized) return NextResponse.json({ code: "ADMIN_REQUIRED" }, { status: auth.status, headers });
      if (method === "GET") return NextResponse.json({ months: await deps.read() }, { headers });
      const body = await request.json().catch(() => null);
      if (method === "POST") {
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ code: "INVALID_ORIGIN_MONTH" }, { status: 400, headers });
        await deps.create(parsed.data, auth.userId);
      } else {
        const parsed = updateSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ code: "IDENTITY_IMMUTABLE_OR_INVALID_INPUT" }, { status: 400, headers });
        await deps.update(parsed.data, auth.userId);
      }
      return NextResponse.json({ saved: true }, { headers });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "BILAN_REGISTRY_UNAVAILABLE";
      const status = code === "ORIGIN_MONTH_CONFLICT" ? 409 : code === "ORIGIN_MONTH_NOT_FOUND" ? 404 : 503;
      return NextResponse.json({ code: status === 503 ? "BILAN_REGISTRY_UNAVAILABLE" : code }, { status, headers });
    }
  }
  return { GET: (request: Request) => handle(request, "GET"), POST: (request: Request) => handle(request, "POST"), PATCH: (request: Request) => handle(request, "PATCH") };
}
