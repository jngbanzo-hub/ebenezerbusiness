import type { BilanRangeRead, BilanRangeReader } from "./bilan-readers-contracts";

export function createBilanGoogleSheetsRangeReader(input: Readonly<{
  spreadsheetIds: Readonly<Record<BilanRangeRead["spreadsheet"], string>>;
  getAccessToken: () => Promise<string>;
  fetcher?: typeof fetch;
}>): BilanRangeReader {
  const fetcher = input.fetcher ?? fetch;
  return Object.freeze({
    mode: "READ_ONLY" as const,
    async read(request: BilanRangeRead) {
      const spreadsheetId = input.spreadsheetIds[request.spreadsheet].trim();
      if (!spreadsheetId) throw new Error("BILAN_SOURCE_UNAVAILABLE");
      const token = await input.getAccessToken();
      const query = new URLSearchParams({
        majorDimension: "ROWS",
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "SERIAL_NUMBER"
      });
      const response = await fetcher(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(request.range)}?${query}`,
        { method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (!response.ok) throw new Error(`BILAN_SOURCE_UNAVAILABLE:${response.status}`);
      const payload = await response.json() as { values?: unknown[][] };
      if (!Array.isArray(payload.values)) return [];
      return payload.values.map((row) => Object.freeze(Array.isArray(row) ? [...row] : []));
    }
  });
}
