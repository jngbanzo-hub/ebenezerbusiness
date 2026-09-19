import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { CertifiedQrParcelIdentity } from "@/server/qr-identity-certifier";

export type QrInitialAssignmentCommand = CertifiedQrParcelIdentity & {
  actorId: string;
  expectedVersion: number;
  requestId: string;
  qrId?: string;
  displayNumber?: number;
};

export type QrInitialAssignmentResult = {
  qrId: string;
  displayNumber: number;
  status: "ASSIGNED";
  agency: CertifiedQrParcelIdentity["agency"];
  trackingCode: string;
  version: number;
  replayed: boolean;
};

export class QrAssignmentMutationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "QrAssignmentMutationError";
  }
}

export async function assignQrLabelInternally(
  command: QrInitialAssignmentCommand
): Promise<QrInitialAssignmentResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new QrAssignmentMutationError("QR_SERVICE_UNAVAILABLE");

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  }).schema("public");
  const { data, error } = await client.rpc("assign_qr_label_server", {
    p_actor_id: command.actorId,
    p_qr_id: command.qrId ?? null,
    p_display_number: command.displayNumber ?? null,
    p_agency: command.agency,
    p_tracking_code: command.trackingCode,
    p_expected_version: command.expectedVersion,
    p_request_id: command.requestId
  });

  if (error || !isAssignmentResult(data)) {
    throw new QrAssignmentMutationError(readQrError(error?.message));
  }
  return data;
}

function readQrError(message: string | undefined) {
  const known = [
    "QR_ACCESS_DENIED",
    "QR_AGENCY_ACCESS_DENIED",
    "INVALID_QR_COMMAND",
    "INVALID_QR_ID",
    "INVALID_QR_DISPLAY_NUMBER",
    "QR_IDEMPOTENCY_CONFLICT",
    "QR_NOT_FOUND",
    "QR_NOT_UNASSIGNED",
    "QR_VERSION_CONFLICT",
    "QR_PARCEL_ALREADY_ASSIGNED"
  ].find((code) => message?.includes(code));
  return known ?? "QR_SERVICE_UNAVAILABLE";
}

function isAssignmentResult(value: unknown): value is QrInitialAssignmentResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.qrId === "string" &&
    typeof item.displayNumber === "number" &&
    item.status === "ASSIGNED" &&
    ["FIH", "LSHI", "KLZ"].includes(String(item.agency)) &&
    typeof item.trackingCode === "string" &&
    typeof item.version === "number" &&
    typeof item.replayed === "boolean"
  );
}
