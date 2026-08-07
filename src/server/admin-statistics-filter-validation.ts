export function parseOptionalInteger(value: string | null, min: number, max: number) {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return false;

  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : false;
}

export function resolveShipmentDateRange(filters: { year: string; month: number | null; from: string; to: string }) {
  if (filters.month !== null) {
    if (!filters.year) return false;
    const month = String(filters.month).padStart(2, "0");
    const lastDay = new Date(Number(filters.year), filters.month, 0).getDate();
    return { from: `${filters.year}-${month}-01`, to: `${filters.year}-${month}-${String(lastDay).padStart(2, "0")}` };
  }

  if (filters.year && !filters.from && !filters.to) return { from: `${filters.year}-01-01`, to: `${filters.year}-12-31` };
  return { from: filters.from, to: filters.to };
}
