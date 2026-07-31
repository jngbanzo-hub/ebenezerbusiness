export type RequestIdAttempt = Readonly<{
  fingerprint: string;
  requestId: string;
}>;

export function createAutomaticRequestId(): string {
  return crypto.randomUUID().toLowerCase();
}

export function getOrCreateRequestIdAttempt(
  current: RequestIdAttempt | null,
  fingerprint: string
): RequestIdAttempt {
  if (current?.fingerprint === fingerprint) return current;
  return Object.freeze({ fingerprint, requestId: createAutomaticRequestId() });
}
