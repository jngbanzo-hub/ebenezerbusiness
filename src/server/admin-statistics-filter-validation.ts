export function parseOptionalInteger(value: string | null, min: number, max: number) {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return false;

  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : false;
}
