import type { ManifestSite } from "@/features/admin/types";

export type ManifestQrCandidateResult =
  | "READY"
  | "MISSING_DATE"
  | "MISSING_TRACKING_CODE"
  | "INVALID_QR_NUMBER"
  | "QR_UNKNOWN"
  | "QR_ALREADY_ASSIGNED"
  | "QR_REVOKED"
  | "PARCEL_ALREADY_ASSIGNED"
  | "DUPLICATE_QR_IN_MANIFEST"
  | "DUPLICATE_PARCEL_IN_MANIFEST";

export type ManifestQrSourceRow = {
  agency: ManifestSite;
  rowNumber: number;
  date: string;
  trackingCode: string;
  qrNumber: string;
};

export type ManifestQrRegistryRow = {
  qrId: string;
  displayNumber: number;
  status: "UNASSIGNED" | "ASSIGNED" | "REVOKED";
  version: number;
};

export type ActiveParcelAssignment = {
  qrId: string;
  agency: ManifestSite;
  trackingCode: string;
};

export type ManifestQrCandidate = ManifestQrSourceRow & {
  displayNumber: string;
  qrId?: string;
  qrStatus?: ManifestQrRegistryRow["status"];
  version?: number;
  ready: boolean;
  result: ManifestQrCandidateResult;
};

export function evaluateManifestQrCandidates(
  sourceRows: readonly ManifestQrSourceRow[],
  registryRows: readonly ManifestQrRegistryRow[],
  activeAssignments: readonly ActiveParcelAssignment[]
): ManifestQrCandidate[] {
  const rowsWithQr = sourceRows.filter((row) => row.qrNumber.trim().length > 0);
  const registry = new Map(registryRows.map((row) => [row.displayNumber, row]));
  const assignedParcels = new Map(activeAssignments.map((row) => [parcelKey(row.agency, row.trackingCode), row.qrId]));
  const qrCounts = counts(rowsWithQr.map((row) => normalizeQrNumber(row.qrNumber)).filter(Boolean));
  const parcelCounts = counts(rowsWithQr
    .filter((row) => row.date.trim() && row.trackingCode.trim())
    .map((row) => parcelKey(row.agency, row.trackingCode)));

  return rowsWithQr.map((row) => {
    const displayNumber = normalizeQrNumber(row.qrNumber);
    const base = { ...row, displayNumber, ready: false };
    if (!row.date.trim()) return { ...base, result: "MISSING_DATE" };
    if (!row.trackingCode.trim()) return { ...base, result: "MISSING_TRACKING_CODE" };
    if (!/^[1-9][0-9]{0,14}$/.test(displayNumber)) return { ...base, result: "INVALID_QR_NUMBER" };
    if ((qrCounts.get(displayNumber) ?? 0) > 1) return { ...base, result: "DUPLICATE_QR_IN_MANIFEST" };
    if ((parcelCounts.get(parcelKey(row.agency, row.trackingCode)) ?? 0) > 1) {
      return { ...base, result: "DUPLICATE_PARCEL_IN_MANIFEST" };
    }
    const qr = registry.get(Number(displayNumber));
    if (!qr) return { ...base, result: "QR_UNKNOWN" };
    const withQr = { ...base, qrId: qr.qrId, qrStatus: qr.status, version: qr.version };
    if (qr.status === "ASSIGNED") return { ...withQr, result: "QR_ALREADY_ASSIGNED" };
    if (qr.status === "REVOKED") return { ...withQr, result: "QR_REVOKED" };
    if (assignedParcels.has(parcelKey(row.agency, row.trackingCode))) {
      return { ...withQr, result: "PARCEL_ALREADY_ASSIGNED" };
    }
    return { ...withQr, ready: true, result: "READY" };
  });
}

export function normalizeQrNumber(value: string) { return value.trim().replace(/^0+(?=\d)/, ""); }
function parcelKey(agency: ManifestSite, trackingCode: string) { return `${agency}|${trackingCode.trim()}`; }
function counts(values: string[]) { const result = new Map<string, number>(); values.forEach((value) => result.set(value, (result.get(value) ?? 0) + 1)); return result; }
