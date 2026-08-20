export type AlertQrAssignment = { agency: string | null; trackingCode: string };
export type AlertManifestRow = { agency: string; trackingCode: string; rowNumber: number };
export type AlertStorageRow = { agency: string; trackingCode: string; status: string };

export function buildConsistencyInputsFromSnapshots(input: {
  assignments: AlertQrAssignment[];
  manifest: AlertManifestRow[];
  storage: AlertStorageRow[];
}) {
  const qrByCode = group(input.assignments, (row) => canonicalCode(row.trackingCode, row.agency));
  const manifestByCode = group(input.manifest, (row) => canonicalCode(row.trackingCode, row.agency));
  const storageByCode = group(input.storage, (row) => canonicalCode(row.trackingCode, row.agency));

  return Array.from(qrByCode.entries()).map(([code, assignments]) => ({
    code,
    input: {
      manifest: (manifestByCode.get(code) ?? []).map((row) => ({ agency: row.agency, rowNumber: row.rowNumber })),
      qr: assignments.map((row) => ({ agency: row.agency })),
      storage: (storageByCode.get(code) ?? []).map((row) => ({ agency: row.agency, status: row.status }))
    }
  }));
}

export function canonicalAlertParcelCode(value: unknown, agency: unknown) {
  const code = String(value ?? "").trim().toUpperCase();
  return String(agency ?? "").trim().toUpperCase() === "KLZ" ? code.replace(/KLZ$/, "") : code;
}

function canonicalCode(value: unknown, agency: unknown) {
  return canonicalAlertParcelCode(value, agency);
}

function group<T>(rows: T[], key: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}
