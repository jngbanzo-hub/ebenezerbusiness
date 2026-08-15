export type ParsedQrBatchLine = {
  lineNumber: number;
  displayNumber: string;
  agency: string;
  trackingCode: string;
};

export function parseQrBatchInput(input: string): ParsedQrBatchLine[] {
  return input
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), lineNumber: index + 1 }))
    .filter((line) => line.raw.length > 0)
    .map(({ raw, lineNumber }) => {
      const parts = raw.split("|").map((part) => part.trim());
      return {
        lineNumber,
        displayNumber: parts.length === 3 ? parts[0] : "",
        agency: parts.length === 3 ? parts[1].toUpperCase() : "",
        trackingCode: parts.length === 3 ? parts[2] : ""
      };
    });
}
