import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/** Dedicated capability: cannot authorize the Admin or Direction routes. */
export function authorizeReminderBilanRead(request: Request, expected = process.env.REMINDER_BILAN_READER_TOKEN) {
  if (!expected || expected.length < 32) return false;
  const supplied = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}
