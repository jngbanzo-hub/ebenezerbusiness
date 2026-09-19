import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import {
  assignQrLabelInternally,
  QrAssignmentMutationError
} from "@/server/qr-assignment-service";
import {
  certifyQrParcelIdentity,
  QrIdentityCertificationError
} from "@/server/qr-identity-certifier";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const commandSchema = z
  .object({
    qrId: z.string().trim().toUpperCase().regex(/^EEBQR[0-9]{6,}$/).optional(),
    displayNumber: z.number().int().positive().safe().optional(),
    agency: z.enum(["FIH", "LSHI", "KLZ"]),
    trackingCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9._/-]{1,63}$/),
    expectedVersion: z.number().int().positive().safe(),
    requestId: z.string().uuid()
  })
  .strict()
  .refine((value) => Boolean(value.qrId) !== Boolean(value.displayNumber), {
    message: "Exactly one QR selector is required."
  });

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("Authorization");
    const bearerToken = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!bearerToken) return fail("ACCESS_DENIED", 401);

    const actor = await authorizeActor(request);
    if (!actor) return fail("ACCESS_DENIED", 403);

    const parsed = commandSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("INVALID_QR_COMMAND", 400);
    if (actor.role === "AGENT" && actor.site !== "COO") {
      return fail("QR_AGENCY_ACCESS_DENIED", 403);
    }

    const certified = await certifyQrParcelIdentity(
      { agency: parsed.data.agency, trackingCode: parsed.data.trackingCode },
      bearerToken
    );
    const result = await assignQrLabelInternally({
      actorId: actor.userId,
      qrId: parsed.data.qrId,
      displayNumber: parsed.data.displayNumber,
      expectedVersion: parsed.data.expectedVersion,
      requestId: parsed.data.requestId,
      ...certified
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (cause) {
    if (cause instanceof QrIdentityCertificationError) {
      return fail(cause.code, cause.status);
    }
    if (cause instanceof QrAssignmentMutationError) {
      return fail(cause.code, mutationStatus(cause.code));
    }
    return fail("QR_SERVICE_UNAVAILABLE", 503);
  }
}

async function authorizeActor(request: Request) {
  const agent = await authorizeAgentRequest(request);
  if (agent.authorized) {
    return {
      userId: agent.identity.userId,
      role: agent.identity.role as "AGENT",
      site: agent.identity.site
    };
  }
  const admin = await authorizeAdminRequest(request);
  if (admin.authorized) {
    return { userId: admin.userId, role: admin.role as "ADMIN", site: admin.agency };
  }
  return null;
}

function mutationStatus(code: string) {
  if (code.includes("ACCESS") || code.includes("AGENCY")) return 403;
  if (code === "QR_NOT_FOUND") return 404;
  if (
    code === "QR_NOT_UNASSIGNED" ||
    code === "QR_VERSION_CONFLICT" ||
    code === "QR_PARCEL_ALREADY_ASSIGNED" ||
    code === "QR_IDEMPOTENCY_CONFLICT"
  ) return 409;
  if (code.startsWith("INVALID_")) return 400;
  return 503;
}

function fail(code: string, status: number) {
  return NextResponse.json(
    { state: "ERROR", code },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
