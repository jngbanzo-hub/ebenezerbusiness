export type ForwardingAttemptState =
  | "idle"
  | "ready"
  | "submitting"
  | "result_unknown_retry_same_id"
  | "success"
  | "failed_final";

export type ForwardingAttempt = Readonly<{
  paymentRequestId: string;
  fingerprint: string;
  state: ForwardingAttemptState;
}>;

export function fingerprintForwardingIntent(input: {
  trackingCode: string;
  sourceAgency: string;
  paymentMode: string;
  optionalReference: string;
  optionalObservation: string;
}) {
  return [input.trackingCode, input.sourceAgency, input.paymentMode, input.optionalReference, input.optionalObservation]
    .map((value) => value.trim().toUpperCase())
    .join("\u001f");
}

export function getOrCreateForwardingAttempt(
  current: ForwardingAttempt | null,
  fingerprint: string,
  createId: () => string = () => crypto.randomUUID()
): ForwardingAttempt {
  if (current?.fingerprint === fingerprint && current.state !== "success") {
    return current;
  }
  return Object.freeze({ paymentRequestId: createId(), fingerprint, state: "ready" });
}

export function transitionForwardingAttempt(current: ForwardingAttempt, state: ForwardingAttemptState) {
  return Object.freeze({ ...current, state });
}
