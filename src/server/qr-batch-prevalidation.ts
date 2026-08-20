import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  certifyQrParcelIdentity,
  QrIdentityCertificationError,
  type QrAgency
} from "@/server/qr-identity-certifier";

export type QrBatchInputLine = {
  lineNumber: number;
  displayNumber: string;
  agency: string;
  trackingCode: string;
};

export type QrBatchResultCode =
  | "READY"
  | "INVALID_QR_NUMBER"
  | "QR_UNKNOWN"
  | "QR_ALREADY_ASSIGNED"
  | "QR_REVOKED"
  | "INVALID_CODE"
  | "INVALID_AGENCY"
  | "PARCEL_ALREADY_ASSIGNED"
  | "DUPLICATE_IN_LIST"
  | "SOURCE_UNAVAILABLE";

export type QrBatchPrevalidationResult = {
  lineNumber: number;
  displayNumber: string;
  qrId?: string;
  agency: string;
  trackingCode: string;
  qrStatus?: "UNASSIGNED" | "ASSIGNED" | "REVOKED";
  version?: number;
  currentAgency?: QrAgency;
  currentTrackingCode?: string;
  manifestCertified: boolean;
  duplicate: boolean;
  ready: boolean;
  result: QrBatchResultCode;
};

type ResolvedQr = {
  qrId: string;
  displayNumber: number;
  status: "UNASSIGNED" | "ASSIGNED" | "REVOKED";
  version: number;
  agency?: QrAgency;
  trackingCode?: string;
};

export type QrBatchPrevalidationDependencies = {
  resolve: (displayNumber: number, bearerToken: string) => Promise<ResolvedQr | null>;
  certify: typeof certifyQrParcelIdentity;
  findActiveAssignment: (agency: QrAgency, trackingCode: string) => Promise<string | null>;
};

export async function prevalidateQrBatch(
  lines: QrBatchInputLine[],
  bearerToken: string,
  dependencies: QrBatchPrevalidationDependencies = defaultDependencies
) {
  const normalized = lines.map((line) => ({
    ...line,
    displayNumber: line.displayNumber.trim(),
    agency: line.agency.trim().toUpperCase(),
    trackingCode: line.trackingCode.trim()
  }));
  const duplicateQr = duplicateKeys(normalized.map((line) => normalizedQrNumber(line.displayNumber)));
  const duplicateParcel = duplicateKeys(normalized.map((line) => `${line.agency}|${line.trackingCode}`));

  return mapWithConcurrency(normalized, 2, async (line) => {
    const qrKey = normalizedQrNumber(line.displayNumber);
    const parcelKey = `${line.agency}|${line.trackingCode}`;
    const base = {
      lineNumber: line.lineNumber,
      displayNumber: line.displayNumber,
      agency: line.agency,
      trackingCode: line.trackingCode,
      manifestCertified: false,
      duplicate: duplicateQr.has(qrKey) || duplicateParcel.has(parcelKey),
      ready: false
    };
    if (base.duplicate) return { ...base, result: "DUPLICATE_IN_LIST" as const };
    if (!/^[1-9][0-9]{0,14}$/.test(qrKey)) {
      return { ...base, result: "INVALID_QR_NUMBER" as const };
    }
    if (!isQrAgency(line.agency)) return { ...base, result: "INVALID_AGENCY" as const };
    if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(line.trackingCode)) {
      return { ...base, result: "INVALID_CODE" as const };
    }

    try {
      const qr = await dependencies.resolve(Number(qrKey), bearerToken);
      if (!qr) return { ...base, result: "QR_UNKNOWN" as const };
      const withQr = {
        ...base,
        qrId: qr.qrId,
        qrStatus: qr.status,
        version: qr.version,
        currentAgency: qr.agency,
        currentTrackingCode: qr.trackingCode
      };
      if (qr.status === "ASSIGNED") return { ...withQr, result: "QR_ALREADY_ASSIGNED" as const };
      if (qr.status === "REVOKED") return { ...withQr, result: "QR_REVOKED" as const };

      const existingQrId = await dependencies.findActiveAssignment(line.agency, line.trackingCode);
      if (existingQrId) return { ...withQr, result: "PARCEL_ALREADY_ASSIGNED" as const };
      await dependencies.certify(
        { agency: line.agency, trackingCode: line.trackingCode },
        bearerToken
      );
      return {
        ...withQr,
        displayNumber: String(qr.displayNumber),
        manifestCertified: true,
        ready: true,
        result: "READY" as const
      };
    } catch (cause) {
      if (cause instanceof QrIdentityCertificationError && cause.code === "IDENTITY_NOT_FOUND") {
        return { ...base, result: "INVALID_CODE" as const };
      }
      return { ...base, result: "SOURCE_UNAVAILABLE" as const };
    }
  });
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

function duplicateKeys(values: string[]) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value]) => value));
}

function normalizedQrNumber(value: string) {
  return value.trim().replace(/^0+(?=\d)/, "");
}

function isQrAgency(value: string): value is QrAgency {
  return ["FIH", "LSHI", "KLZ"].includes(value);
}

const defaultDependencies: QrBatchPrevalidationDependencies = {
  resolve: resolveQr,
  certify: certifyQrParcelIdentity,
  findActiveAssignment
};

async function resolveQr(displayNumber: number, _bearerToken: string): Promise<ResolvedQr | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("QR_SERVICE_UNAVAILABLE");
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  }).schema("public");
  const { data, error } = await client.rpc("read_qr_manifest_registry_server", {
    p_display_numbers: [displayNumber]
  });
  if (error || !data || typeof data !== "object") throw new Error("QR_SERVICE_UNAVAILABLE");
  const row = Array.isArray(data.registry) ? data.registry[0] : undefined;
  if (!row) return null;
  return {
    qrId: String(row.qrId),
    displayNumber: Number(row.displayNumber),
    status: String(row.status) as ResolvedQr["status"],
    version: Number(row.version),
    agency: ["FIH", "LSHI", "KLZ"].includes(String(row.agency))
      ? String(row.agency) as QrAgency
      : undefined,
    trackingCode: typeof row.trackingCode === "string" ? row.trackingCode : undefined
  };
}

async function findActiveAssignment(agency: QrAgency, trackingCode: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("QR_SERVICE_UNAVAILABLE");
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  }).schema("public");
  const { data, error } = await client.rpc("read_qr_manifest_registry_server", {
    p_display_numbers: []
  });
  if (error || !data || typeof data !== "object") throw new Error("QR_SERVICE_UNAVAILABLE");
  const assignments = Array.isArray(data.activeAssignments) ? data.activeAssignments : [];
  const match = assignments.find((row: Record<string, unknown>) =>
    String(row.agency) === agency && String(row.trackingCode) === trackingCode
  );
  return match ? String(match.qrId) : null;
}
