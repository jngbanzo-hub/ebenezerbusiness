import type { AdminExpense } from "../expenses";
import type { AdminPayment } from "../types";
import type { BilanExpense, BilanPayment, BilanReadAnomaly, BilanReadResult } from "./bilan-readers-contracts";
import { canonicalParcelCode } from "./cohort-registry";

export type BilanPaymentsRead = () => Promise<readonly AdminPayment[]>;
export type BilanExpensesRead = () => Promise<readonly AdminExpense[] | Readonly<{ rows: readonly AdminExpense[]; complete: boolean }>>;
export type BilanExpenseReadStatus = "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE";

export class IncompleteBilanExpensesError extends Error {
  constructor() {
    super("La lecture des dépenses est incomplète ; le Bilan n’a pas été présenté comme complet.");
    this.name = "IncompleteBilanExpensesError";
  }
}

export async function readBilanPayments(read: BilanPaymentsRead) {
  try { return adaptPayments(await read()); }
  catch { return result([], [sourceUnavailable("ENCAISSEMENTS")]); }
}

export function adaptPayments(payments: readonly AdminPayment[]): BilanReadResult<BilanPayment> {
  const rows: BilanPayment[] = [];
  const anomalies: BilanReadAnomaly[] = [];
  for (const payment of payments) {
    const code = canonicalParcelCode(payment.codeColis);
    const paymentRequestId = payment.paymentRequestId?.trim() ?? "";
    if (!code || !paymentRequestId) {
      anomalies.push(Object.freeze({ code: "PAIEMENT_SANS_IDENTITE", source: "ENCAISSEMENTS", message: `Paiement ${payment.id} sans code exact ou paymentRequestId.` }));
      continue;
    }
    rows.push(Object.freeze({
      paymentDate: payment.dateTime,
      code,
      expectedAmount: payment.montantAttendu,
      paidAmount: payment.montantPaye,
      destination: payment.destinationCode,
      collectingAgency: payment.agenceEncaissement,
      status: payment.statutPaiement,
      paymentRequestId,
      sourceReference: payment.id
    }));
  }
  return result(rows, anomalies);
}

export async function readBilanExpenses(read: BilanExpensesRead): Promise<BilanReadResult<BilanExpense> & { readStatus: BilanExpenseReadStatus }> {
  try {
    const batch = await read();
    const hasPaginationMetadata = "rows" in batch;
    const adapted = adaptExpenses(hasPaginationMetadata ? batch.rows : batch);
    const complete = !hasPaginationMetadata || batch.complete;
    const anomalies = hasPaginationMetadata && !batch.complete
      ? [...adapted.anomalies, Object.freeze({ code: "LECTURE_INCOMPLETE", source: "DÉPENSES", message: "Pagination des dépenses incomplète ou incohérente." })]
      : adapted.anomalies;
    return Object.freeze({ rows: adapted.rows, anomalies: Object.freeze(anomalies), readStatus: complete ? "COMPLETE" : "INCOMPLETE" });
  } catch {
    return Object.freeze({ ...result([], [sourceUnavailable("DÉPENSES")]), readStatus: "UNAVAILABLE" });
  }
}

export function adaptExpenses(expenses: readonly AdminExpense[]): BilanReadResult<BilanExpense> {
  const rows: BilanExpense[] = [];
  const anomalies: BilanReadAnomaly[] = [];
  for (const expense of expenses) {
    if (!expense.devise.trim()) {
      anomalies.push(Object.freeze({ code: "DEVISE_ABSENTE", source: "DÉPENSES", message: `Dépense ${expense.id} sans devise.` }));
      continue;
    }
    if (!expense.categorie.trim() || !Number.isFinite(expense.montant) || expense.montant < 0) {
      anomalies.push(Object.freeze({ code: "DEPENSE_AMBIGUE", source: "DÉPENSES", message: `Dépense ${expense.id} incomplète ou ambiguë.` }));
      continue;
    }
    rows.push(Object.freeze({
      date: expense.date,
      agency: expense.agence,
      category: expense.categorie,
      amount: expense.montant,
      currency: expense.devise,
      description: expense.description,
      reference: expense.reference,
      status: expense.statut,
      cancelled: expense.annulee,
      corrected: expense.corrigee,
      sourceReference: expense.id
    }));
  }
  return result(rows, anomalies);
}

function result<T>(rows: T[], anomalies: BilanReadAnomaly[]): BilanReadResult<T> {
  return Object.freeze({ rows: Object.freeze(rows), anomalies: Object.freeze(anomalies) });
}

function sourceUnavailable(source: string): BilanReadAnomaly {
  return Object.freeze({ code: "SOURCE_INDISPONIBLE", source, message: "Source de lecture BILAN indisponible." });
}
