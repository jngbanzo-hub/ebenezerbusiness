// Africa/Porto-Novo is UTC+01:00. Input dates are validated by parseAdminTransferFilters.
export function resolveAuditUtcBounds(period: { from: string; to: string }) {
  const startInclusive = Date.parse(`${period.from}T00:00:00.000+01:00`);
  const endExclusive = Date.parse(`${period.to}T00:00:00.000+01:00`) + 86_400_000;
  if (!Number.isFinite(startInclusive) || !Number.isFinite(endExclusive) || startInclusive >= endExclusive) {
    throw new Error("INVALID_AUDIT_DATE_RANGE");
  }
  return {
    dateFrom: new Date(startInclusive).toISOString(),
    // Apps Script V5 uses <= dateTo at JavaScript millisecond precision.
    // The last included millisecond preserves that contract and equals < endExclusive.
    dateTo: new Date(endExclusive - 1).toISOString()
  };
}
