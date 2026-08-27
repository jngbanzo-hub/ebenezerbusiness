import "server-only";

import { StockagesV2Error } from "@/server/stockages-v2";

export function isForwardingEnabled() {
  return process.env.STOCKAGES_FORWARDING_ENABLED === "true";
}

export function assertForwardingEnabled() {
  if (!isForwardingEnabled()) throw new StockagesV2Error("FORWARDING_DISABLED", 503);
}
