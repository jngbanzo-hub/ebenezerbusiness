import type { Agency, DestinationCode, PaymentMode } from "@/features/agent/types";

export interface PaymentIntent {
  codeColis: string;
  destinationCode: DestinationCode;
  montantPaye: number;
  modePaiement: PaymentMode;
  referencePaiement: string;
  observation: string;
}

export interface PaymentAttempt {
  fingerprint: string;
  paymentRequestId: string;
}

export function fingerprintPaymentIntent(intent: PaymentIntent): string {
  return JSON.stringify([
    intent.codeColis.trim().toUpperCase(),
    intent.destinationCode,
    intent.montantPaye.toFixed(2),
    intent.modePaiement,
    intent.referencePaiement.trim(),
    intent.observation.trim()
  ]);
}

export function getOrCreatePaymentAttempt(
  currentAttempt: PaymentAttempt | null,
  fingerprint: string
): PaymentAttempt {
  if (currentAttempt?.fingerprint === fingerprint) {
    return currentAttempt;
  }

  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Impossible de sécuriser cette demande de paiement.");
  }

  return {
    fingerprint,
    paymentRequestId: crypto.randomUUID()
  };
}

export function isPaymentAmountAllowed(
  agency: Agency,
  amount: number,
  balance: number
): boolean {
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    Number.isFinite(balance) &&
    balance > 0 &&
    amount <= balance &&
    (agency === "COTONOU" || Math.abs(amount - balance) <= 0.009)
  );
}
