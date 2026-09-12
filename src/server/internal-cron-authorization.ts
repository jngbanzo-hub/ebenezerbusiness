import "server-only";

import { timingSafeEqual } from "node:crypto";

export function isAuthorizedInternalCron(header: string | null) {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
