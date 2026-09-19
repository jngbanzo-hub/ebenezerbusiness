import { createHash } from "crypto";

import { StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";

export type ForwardingResumeRow = Readonly<{
  request_id: string;
  command_fingerprint: string;
  actor_id: string;
  state: string;
}>;

export type ForwardingResume = Readonly<{
  state: string;
  resumable: boolean;
  paymentRequestId?: string;
}>;

export function forwardingCommandFingerprint(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function selectForwardingResume(
  rows: readonly ForwardingResumeRow[],
  input: {
    actorId: string;
    expectedFingerprint: string;
  }
): ForwardingResume | null {
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new StockagesV2Error("FORWARDING_RESUME_AMBIGUOUS", 409);
  const row = rows[0]!;
  if (row.actor_id !== input.actorId) throw new StockagesV2Error("FORWARDING_RESUME_FORBIDDEN", 403);
  if (row.command_fingerprint !== input.expectedFingerprint) throw new StockagesV2Error("IDEMPOTENCY_CONFLICT", 409);
  if (row.state === "PAYMENT_IN_PROGRESS") {
    return Object.freeze({ state: row.state, resumable: true, paymentRequestId: row.request_id });
  }
  return Object.freeze({ state: row.state, resumable: false });
}

export function buildForwardingFingerprint(input: {
  trackingCode: string;
  origin: StorageAgency;
  destination: StorageAgency;
  paymentMode: string;
  optionalReference: string;
  optionalObservation: string;
  amountExpectedUsd: number;
}) {
  return forwardingCommandFingerprint(input);
}
