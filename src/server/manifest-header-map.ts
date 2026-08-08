export type ManifestHeaderMap = Readonly<{
  headerRowIndex: number;
  headers: readonly string[];
  statusIndex: number;
}>;

export function detectManifestHeaderMap(rows: readonly unknown[][]): ManifestHeaderMap {
  for (let headerRowIndex = 0; headerRowIndex < Math.min(rows.length, 20); headerRowIndex += 1) {
    const headers = rows[headerRowIndex].map((cell) => String(cell ?? "").trim());
    const normalized = headers.map(normalizeManifestHeader);
    const hasDate = normalized.includes("DATE");
    const hasCode = normalized.some((header) => header === "CODE" || header === "CODE COLIS");
    const statusIndex = normalized.findIndex((header) => header === "STATUT" || header === "STATUS");
    if (hasDate && hasCode && statusIndex >= 0) {
      return Object.freeze({ headerRowIndex, headers: Object.freeze(headers), statusIndex });
    }
  }
  return Object.freeze({ headerRowIndex: -1, headers: Object.freeze([]), statusIndex: -1 });
}

export function normalizeManifestHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
