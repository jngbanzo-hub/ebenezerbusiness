import { createHash } from "crypto";

/** Distinguishes a new forwarding cycle without rewriting historical references. */
export function forwardingCycleReference(baseReference: string, requestId: string, hasCancelledCycle: boolean) {
  return hasCancelledCycle
    ? `${baseReference}-R${requestId.toUpperCase().replaceAll("-", "").slice(0, 21)}`
    : baseReference;
}

/** Keeps the original idempotency key for ordinary cycles, but not for a later cycle. */
export function forwardingCycleFingerprint(baseFingerprint: string, cancelledForwardingId: string | null) {
  return cancelledForwardingId
    ? createHash("sha256").update(JSON.stringify({ baseFingerprint, cancelledForwardingId })).digest("hex")
    : baseFingerprint;
}
