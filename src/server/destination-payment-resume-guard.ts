import type { AdminPayment } from "@/features/admin/types";
import type { PaymentOrchestrationRow } from "@/server/destination-payment-parcel";
import type { StorageAgency } from "@/server/stockages-v2";

type CashRow = {
  event_id: string;
  source_request_id: string;
  agency: string;
  amount: number | string;
  direction: string;
  metadata: { commandFingerprint?: string } | null;
};

export type ResumeEvidence = {
  agency: StorageAgency;
  trackingCode: string;
  parcelId: string;
  orchestration: PaymentOrchestrationRow | null;
  otherOrchestrations: Array<{ request_id: string; parcel_id: string | null; state: string }>;
  parcel: { parcel_id: string; tracking_code: string; agency: string; forwarding_id: string | null; canonical_weight_kg: number | string; delivery_status: string } | null;
  sameCodeParcels: Array<{ parcel_id: string }>;
  account: { status: string; current_parcel_count: number | string; current_weight_kg: number | string } | null;
  canonical: AdminPayment | null;
  sameCodePayments: AdminPayment[];
  cashRows: CashRow[];
  fingerprintCashRows: Array<{ event_id: string; source_request_id: string }>;
  storageRows: Array<{ event_id: string }>;
  storageExitRows: Array<{ event_id: string }>;
  relatedForwardings: Array<{ forwarding_id: string }>;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function money(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function isSold(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === "SOLDE";
}

export function certifyDestinationResume(evidence: ResumeEvidence): boolean {
  const { agency, trackingCode, parcelId, orchestration: row, parcel, account, canonical } = evidence;
  if (!row || !parcel || !account || !canonical || !uuid.test(row.request_id) || !uuid.test(parcelId) ||
      !/^[0-9a-f]{64}$/i.test(row.command_fingerprint) ||
      row.state !== "PENDING" || row.stockage_event_id !== null || row.forwarding_id !== null ||
      row.parcel_id !== parcelId || row.tracking_code !== trackingCode || row.agency !== agency ||
      parcel.parcel_id !== parcelId || parcel.tracking_code !== trackingCode || parcel.agency !== agency ||
      parcel.forwarding_id !== null || !["AVAILABLE", "PRESENT"].includes(parcel.delivery_status) ||
      evidence.sameCodeParcels.length !== 1 || evidence.sameCodeParcels[0].parcel_id !== parcelId ||
      account.status !== "ACTIVE" || Number(account.current_parcel_count) < 1 ||
      Number(account.current_weight_kg) < Number(parcel.canonical_weight_kg) ||
      !Number.isFinite(Number(parcel.canonical_weight_kg)) || Number(parcel.canonical_weight_kg) <= 0 ||
      evidence.relatedForwardings.length !== 0 || evidence.storageRows.length !== 0 || evidence.storageExitRows.length !== 0) return false;

  if (evidence.otherOrchestrations.some((other) =>
    other.request_id !== row.request_id &&
    (other.parcel_id === parcelId || other.parcel_id === null) &&
    ["PENDING", "COMPLETED", "COMPENSATION_REQUIRED"].includes(other.state)
  )) return false;

  if (canonical.paymentRequestId?.toLowerCase() !== row.request_id.toLowerCase() ||
      canonical.codeColis !== trackingCode || canonical.agenceEncaissement !== agency ||
      canonical.destinationCode !== agency || !isSold(canonical.statutPaiement) ||
      money(canonical.soldeRestant) !== 0 || money(canonical.montantPaye) !== money(row.paid_amount) ||
      money(canonical.montantAttendu) !== money(row.expected_amount) ||
      money(canonical.poidsKg) !== money(parcel.canonical_weight_kg) ||
      canonical.agent.trim() !== row.actor_name?.trim()) return false;

  if (typeof row.payment_created !== "boolean" ||
      (row.payment_created === false && row.payment_response !== null)) return false;
  if (row.payment_created === true) {
    const response = row.payment_response as Record<string, unknown> | null;
    if (!response || response.codeColis !== trackingCode || response.destinationCode !== agency ||
        money(response.montantPaye as number | string | undefined) !== money(row.paid_amount) ||
        money(response.nouveauSolde as number | string | undefined) !== 0 ||
        !isSold(String(response.statutPaiement ?? ""))) return false;
  }

  const finalPayments = evidence.sameCodePayments.filter((payment) =>
    isSold(payment.statutPaiement) && money(payment.soldeRestant) === 0
  );
  if (finalPayments.length !== 1 || finalPayments[0].paymentRequestId?.toLowerCase() !== row.request_id.toLowerCase()) return false;

  if (evidence.cashRows.length > 1 || evidence.fingerprintCashRows.length > 1) return false;
  const cash = evidence.cashRows[0];
  if (cash && (cash.source_request_id !== row.request_id || cash.agency !== agency ||
      cash.direction !== "CREDIT" || money(cash.amount) !== money(row.paid_amount) ||
      cash.metadata?.commandFingerprint !== row.command_fingerprint ||
      (row.cash_event_id !== null && row.cash_event_id !== cash.event_id))) return false;
  if (row.cash_event_id !== null && !cash) return false;
  const fingerprintCash = evidence.fingerprintCashRows[0];
  if (fingerprintCash && (!cash || fingerprintCash.event_id !== cash.event_id ||
      fingerprintCash.source_request_id !== row.request_id)) return false;
  return true;
}
