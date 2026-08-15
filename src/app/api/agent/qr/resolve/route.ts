import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const rawNumber = new URL(request.url).searchParams.get("displayNumber") ?? "";
    if (!/^[1-9][0-9]{0,14}$/.test(rawNumber)) {
      return fail("INVALID_QR_DISPLAY_NUMBER", 400);
    }

    const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!token || !url || !key) return fail("QR_SERVICE_UNAVAILABLE", 503);

    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    }).schema("public");
    const { data, error } = await client.rpc("resolve_qr_display_number", {
      p_display_number: Number(rawNumber)
    });
    if (error) return fail(readQrError(error.message), 503);
    if (!data || data.status === "UNKNOWN") return fail("QR_NOT_FOUND", 404);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch {
    return fail("QR_SERVICE_UNAVAILABLE", 503);
  }
}

function readQrError(message: string) {
  return message.includes("INVALID_QR_DISPLAY_NUMBER")
    ? "INVALID_QR_DISPLAY_NUMBER"
    : message.includes("QR_ACCESS_DENIED")
      ? "ACCESS_DENIED"
      : "QR_SERVICE_UNAVAILABLE";
}

function fail(code: string, status: number) {
  return NextResponse.json(
    { state: "ERROR", code },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
