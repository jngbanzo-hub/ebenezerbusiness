import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  type QrAgency
} from "@/server/qr-identity-certifier";
import { readCanonicalPaymentManifestRows } from "@/server/admin-manifest-sheets";

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
  readRegistry: (displayNumbers: number[]) => Promise<{
    registry: ResolvedQr[];
    activeAssignments: Array<{ qrId: string; agency: QrAgency; trackingCode: string }>;
  }>;
  readManifestIdentities: () => Promise<Set<string>>;
};

export async function prevalidateQrBatch(
  lines: QrBatchInputLine[],
  _bearerToken: string,
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
  const displayNumbers = Array.from(new Set(normalized
    .map((line) => normalizedQrNumber(line.displayNumber))
    .filter((value) => /^[1-9][0-9]{0,14}$/.test(value))
    .map(Number)));
  const requestStartedAt = Date.now();
  const [registryResult, manifestResult] = await Promise.allSettled([
    measured("QR_REGISTRY", () => dependencies.readRegistry(displayNumbers)),
    measured("MANIFEST_CANONICAL", dependencies.readManifestIdentities)
  ]);
  const registryAvailable = registryResult.status === "fulfilled";
  const manifestAvailable = manifestResult.status === "fulfilled";
  const registrySnapshot = registryAvailable
    ? registryResult.value
    : { registry: [], activeAssignments: [] };
  const manifestIdentities = manifestAvailable ? manifestResult.value : new Set<string>();
  const registry = new Map(registrySnapshot.registry.map((qr) => [qr.displayNumber, qr]));
  const assignedParcels = new Set(registrySnapshot.activeAssignments.map((item) => `${item.agency}|${item.trackingCode}`));

  const results = normalized.map((line) => {
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
    if (!registryAvailable) return { ...base, result: "SOURCE_UNAVAILABLE" as const };

    const qr = registry.get(Number(qrKey));
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
    if (assignedParcels.has(parcelKey)) return { ...withQr, result: "PARCEL_ALREADY_ASSIGNED" as const };
    if (!manifestAvailable) return { ...withQr, result: "SOURCE_UNAVAILABLE" as const };
    if (!manifestIdentities.has(parcelKey)) return { ...withQr, result: "INVALID_CODE" as const };
    return {
      ...withQr,
      displayNumber: String(qr.displayNumber),
      manifestCertified: true,
      ready: true,
      result: "READY" as const
    };
  });
  console.info("[qr-batch-prevalidation]", JSON.stringify({
    step: "BATCH_RESULT",
    durationMs: Date.now() - requestStartedAt,
    success: true,
    lines: results.length,
    ready: results.filter((line) => line.ready).length,
    errors: results.filter((line) => !line.ready).length
  }));
  return results;
}

async function measured<T>(step: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const value = await operation();
    console.info("[qr-batch-prevalidation]", JSON.stringify({
      step,
      durationMs: Date.now() - startedAt,
      success: true
    }));
    return value;
  } catch (cause) {
    console.error("[qr-batch-prevalidation]", JSON.stringify({
      step,
      durationMs: Date.now() - startedAt,
      success: false,
      code: cause instanceof Error ? cause.message : "UNKNOWN_ERROR"
    }));
    throw cause;
  }
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
  readRegistry: readQrRegistrySnapshot,
  readManifestIdentities: readCanonicalManifestIdentities
};

async function readCanonicalManifestIdentities() {
  const rows = await readCanonicalPaymentManifestRows();
  return new Set(rows.flatMap((row) => {
    const agency = String(row.sourceSite).trim().toUpperCase();
    const trackingCode = String(row.codeColisRaw ?? "").trim().toUpperCase();
    return isQrAgency(agency) && trackingCode ? [`${agency}|${trackingCode}`] : [];
  }));
}

async function readQrRegistrySnapshot(displayNumbers: number[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("QR_SERVICE_UNAVAILABLE");
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  }).schema("public");
  const { data, error } = await client.rpc("read_qr_manifest_registry_server", {
    p_display_numbers: displayNumbers
  });
  if (error || !data || typeof data !== "object") throw new Error("QR_SERVICE_UNAVAILABLE");
  const registry = Array.isArray(data.registry) ? data.registry : [];
  const assignments = Array.isArray(data.activeAssignments) ? data.activeAssignments : [];
  return {
    registry: registry.map((row: Record<string, unknown>) => ({
      qrId: String(row.qrId),
      displayNumber: Number(row.displayNumber),
      status: String(row.status) as ResolvedQr["status"],
      version: Number(row.version),
      agency: isQrAgency(String(row.agency)) ? String(row.agency) as QrAgency : undefined,
      trackingCode: typeof row.trackingCode === "string" ? row.trackingCode : undefined
    })),
    activeAssignments: assignments.flatMap((row: Record<string, unknown>) => {
      const agency = String(row.agency);
      const trackingCode = String(row.trackingCode ?? "");
      return isQrAgency(agency) && trackingCode
        ? [{ qrId: String(row.qrId), agency, trackingCode }]
        : [];
    })
  };
}
