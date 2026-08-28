export type StorageParcelIdentity = Readonly<{
  parcelId: string;
  agency: string;
  trackingCode: string;
  forwardingId: string | null;
  originAgency?: string | null;
  destinationAgency?: string | null;
}>;

export type ForwardingAlias = Readonly<{
  trackingCode: string;
  originAgency: "KLZ" | "LSHI" | "FIH";
  destinationAgency: "KLZ" | "LSHI" | "FIH";
}>;

export function parseForwardingAlias(value: unknown): ForwardingAlias | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  const match = normalized.match(/^([A-Z0-9][A-Z0-9._/]{1,63}?)(?: |-|)(KLZ|LSHI|FIH)-(KLZ|LSHI|FIH)$/);
  if (!match) return null;
  const originAgency = match[2] as "KLZ" | "LSHI" | "FIH";
  const destinationAgency = match[3] as "KLZ" | "LSHI" | "FIH";
  if (originAgency === destinationAgency) return null;
  return Object.freeze({
    trackingCode: match[1],
    originAgency,
    destinationAgency
  });
}

export function storageParcelDisplayCode(parcel: StorageParcelIdentity) {
  if (!parcel.forwardingId) return parcel.trackingCode;
  const origin = parcel.originAgency?.trim().toUpperCase();
  const destination = parcel.destinationAgency?.trim().toUpperCase() || parcel.agency.trim().toUpperCase();
  return origin && destination ? `${parcel.trackingCode} · ${origin}-${destination}` : parcel.trackingCode;
}

export function selectStorageParcel(candidates: readonly StorageParcelIdentity[], parcelId?: string | null) {
  if (parcelId) return candidates.find((candidate) => candidate.parcelId === parcelId) ?? null;
  return candidates.length === 1 ? candidates[0] : null;
}

export function hasStorageParcelCollision(candidates: readonly StorageParcelIdentity[]) {
  return candidates.length > 1;
}
