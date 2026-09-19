const FORWARDING_AGENCIES = new Set(["KLZ", "LSHI", "FIH"]);

export function departureDisplayCode(row: Record<string, unknown>) {
  const fallback = String(row.tracking_code ?? "—");
  const identity = row.forwarding_identity && typeof row.forwarding_identity === "object" ? row.forwarding_identity as Record<string, unknown> : null;
  const forwardingId = String(identity?.forwardingId ?? "").trim();
  const trackingCode = String(identity?.trackingCode ?? "").trim().toUpperCase();
  const originAgency = String(identity?.originAgency ?? "").trim().toUpperCase();
  const destinationAgency = String(identity?.destinationAgency ?? "").trim().toUpperCase();
  if (!forwardingId || !trackingCode || !FORWARDING_AGENCIES.has(originAgency) || !FORWARDING_AGENCIES.has(destinationAgency) || originAgency === destinationAgency) return fallback;
  return `${trackingCode} · ${originAgency}-${destinationAgency}`;
}
