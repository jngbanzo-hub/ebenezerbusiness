import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 6;
const recentRequests: number[] = [];

export type DirectionServiceAuthorization =
  | Readonly<{ authorized: true }>
  | Readonly<{ authorized: false; status: 401 | 429 | 503; code: "UNAUTHORIZED" | "RATE_LIMITED" | "SERVICE_AUTH_NOT_CONFIGURED" }>;

export function authorizeDirectionServiceRequest(request: Request, now = Date.now()): DirectionServiceAuthorization {
  const expected = process.env.WHATSAPP_DIRECTION_READER_TOKEN?.trim();
  if (!expected || expected.length < 32) {
    return { authorized: false, status: 503, code: "SERVICE_AUTH_NOT_CONFIGURED" };
  }

  const supplied = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  if (!secureEqual(supplied, expected)) {
    return { authorized: false, status: 401, code: "UNAUTHORIZED" };
  }

  while (recentRequests.length && recentRequests[0] <= now - WINDOW_MS) recentRequests.shift();
  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return { authorized: false, status: 429, code: "RATE_LIMITED" };
  }
  recentRequests.push(now);
  return { authorized: true };
}

function secureEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
