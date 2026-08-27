export type StorageParcelIdentity = Readonly<{
  parcelId: string;
  agency: string;
  trackingCode: string;
  forwardingId: string | null;
  originAgency?: string | null;
  destinationAgency?: string | null;
}>;

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
