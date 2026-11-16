import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  readCashRecoveryExpenseSource,
  type CashRecoveryExpenseSource
} from "@/server/agent-expenses-apps-script";
import {
  createSupabaseExpenseDebitWriter,
  fingerprint,
  type ExpenseDebitWriter
} from "@/server/cash-expense-debit";

const TARGET_ID = "625e5fe7-b0be-4353-b773-fed9c49e8a6f";
const TARGET_ACTOR_ID = "12292e33-4be8-4aea-97ed-67df2e77a7a1";
const TARGET_DATE = "2026-11-16";
const TARGET_SOURCE_ID = `expense:KLZ:${TARGET_ID}`;

type AdminIdentity = Readonly<{
  userId: string;
  email: string;
  agency: "COO" | "FIH" | "LSHI" | "KLZ" | null;
}>;

export type LinkedCashEvent = Readonly<{
  event_id: string;
  agency: string;
  amount: number;
  currency: string;
  event_type: string;
  direction: string;
  source_type: string;
  source_id: string;
  source_request_id: string;
  metadata: Record<string, unknown> | null;
}>;

export type RecoveryDependencies = Readonly<{
  readSource: (identity: AdminIdentity, id: string) => Promise<CashRecoveryExpenseSource>;
  readLinkedCashEvents: (id: string) => Promise<LinkedCashEvent[]>;
  writer: ExpenseDebitWriter;
  now: () => Date;
}>;

export class ExpenseCashRecoveryError extends Error {
  constructor(readonly code: string, readonly status: 400 | 409 | 503) {
    super(code);
    this.name = "ExpenseCashRecoveryError";
  }
}

export function createRecoveryDependencies(): RecoveryDependencies {
  return {
    readSource: readCashRecoveryExpenseSource,
    readLinkedCashEvents: readLinkedCashEvents,
    writer: createSupabaseExpenseDebitWriter(),
    now: () => new Date()
  };
}

export async function inspectExpenseCashRecovery(
  identity: AdminIdentity,
  expenseRequestId: string,
  dependencies: RecoveryDependencies = createRecoveryDependencies()
) {
  checkTarget(expenseRequestId);
  const source = await dependencies.readSource(identity, TARGET_ID);
  certifySource(source);
  const fingerprintValue = sourceFingerprint(source);
  const events = await dependencies.readLinkedCashEvents(TARGET_ID);
  const cashState = classifyCashEvents(events, fingerprintValue);
  return {
    expenseRequestId: TARGET_ID,
    agency: "KLZ" as const,
    amount: 1,
    currency: "USD" as const,
    sourceDate: source.dateHeure,
    sourceStatus: source.statut,
    sourceAgent: source.agent,
    cashEventCount: cashState === "ABSENT" ? 0 : 1,
    eligible: cashState === "ABSENT"
  };
}

export async function confirmExpenseCashRecovery(
  identity: AdminIdentity,
  expenseRequestId: string,
  dependencies: RecoveryDependencies = createRecoveryDependencies()
) {
  checkTarget(expenseRequestId);
  // La source et la Caisse sont relues pour chaque confirmation, jamais reprises d'une prévisualisation.
  const source = await dependencies.readSource(identity, TARGET_ID);
  certifySource(source);
  const fingerprintValue = sourceFingerprint(source);
  const before = await dependencies.readLinkedCashEvents(TARGET_ID);
  if (classifyCashEvents(before, fingerprintValue) !== "ABSENT") {
    return { cashEventCount: 1, debitCreated: false, alreadyRecorded: true };
  }

  const resumedAt = dependencies.now().toISOString();
  const sourceBusinessDate = businessDate(source.dateHeure);
  let replayed = false;
  try {
    const debit = await dependencies.writer({
      actorName: identity.email,
      actorUserId: identity.userId,
      agency: "KLZ",
      allowCreate: true,
      amount: 1,
      businessDate: sourceBusinessDate,
      category: source.categorie.trim(),
      commandFingerprint: fingerprintValue,
      expenseReference: TARGET_ID,
      expenseRequestId: TARGET_ID,
      metadata: {
        category: source.categorie.trim(),
        description: source.description.trim(),
        modePaiement: source.modePaiement.trim(),
        observation: source.observation.trim(),
        reference: source.reference.trim(),
        source: "DEPENSES_PUBLIC",
        sourceAgent: source.agent.trim(),
        sourceActorId: source.creationActorId.toLowerCase(),
        sourceOccurredAt: source.dateHeure,
        recovery: "ADMIN_CONFIRMED",
        recoveredAt: resumedAt
      },
      occurredAt: resumedAt
    });
    replayed = debit.replayed;
  } catch (error) {
    // Une confirmation concurrente peut avoir gagné le verrou SQL.
    const concurrent = await dependencies.readLinkedCashEvents(TARGET_ID);
    if (classifyCashEvents(concurrent, fingerprintValue) !== "ABSENT") {
      return { cashEventCount: 1, debitCreated: false, alreadyRecorded: true };
    }
    throw error;
  }

  const after = await dependencies.readLinkedCashEvents(TARGET_ID);
  if (classifyCashEvents(after, fingerprintValue) !== "PRESENT") {
    throw new ExpenseCashRecoveryError("CASH_RESULT_UNCERTIFIED", 503);
  }
  return { cashEventCount: 1, debitCreated: !replayed, alreadyRecorded: replayed };
}

function checkTarget(value: string) {
  if (value.toLowerCase() !== TARGET_ID) {
    throw new ExpenseCashRecoveryError("EXPENSE_NOT_IN_SCOPE", 400);
  }
}

function certifySource(source: CashRecoveryExpenseSource) {
  if (
    source.expenseRequestId.toLowerCase() !== TARGET_ID ||
    source.agence !== "KLZ" ||
    source.statut !== "ACTIVE" ||
    source.montant !== 1 ||
    source.devise !== "USD" ||
    source.categorie.trim() !== "Connexion" ||
    source.description.trim() !== "OK" ||
    source.modePaiement.trim() !== "ESPÈCES" ||
    source.reference.trim() !== "" ||
    source.observation.trim() !== "" ||
    source.agent.trim() !== "Maman Deborah" ||
    source.creationAuditCount !== 1 ||
    source.creationActorId.toLowerCase() !== TARGET_ACTOR_ID ||
    source.creationActorName.trim() !== source.agent.trim() ||
    businessDate(source.dateHeure) !== TARGET_DATE
  ) {
    throw new ExpenseCashRecoveryError("EXPENSE_SOURCE_MISMATCH", 409);
  }
}

function sourceFingerprint(source: CashRecoveryExpenseSource) {
  return fingerprint({
    agency: source.agence,
    amount: source.montant,
    category: source.categorie.trim(),
    currency: source.devise,
    description: source.description.trim(),
    expenseReference: source.reference.trim(),
    expenseRequestId: source.expenseRequestId.toLowerCase(),
    modePaiement: source.modePaiement.trim(),
    observation: source.observation.trim()
  });
}

function classifyCashEvents(events: LinkedCashEvent[], expectedFingerprint: string) {
  if (events.length === 0) return "ABSENT" as const;
  if (
    events.length !== 1 ||
    events[0].agency !== "KLZ" ||
    Number(events[0].amount) !== 1 ||
    events[0].currency !== "USD" ||
    events[0].event_type !== "EXPENSE_DEBIT_RECORDED" ||
    events[0].direction !== "DEBIT" ||
    events[0].source_type !== "EXPENSE_ENGINE" ||
    events[0].source_request_id !== TARGET_ID ||
    events[0].source_id !== TARGET_SOURCE_ID ||
    events[0].metadata?.commandFingerprint !== expectedFingerprint
  ) {
    throw new ExpenseCashRecoveryError("CASH_EVENT_CONFLICT", 409);
  }
  return "PRESENT" as const;
}

function businessDate(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new ExpenseCashRecoveryError("INVALID_SOURCE_DATE", 409);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Porto-Novo",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

async function readLinkedCashEvents(expenseRequestId: string): Promise<LinkedCashEvent[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new ExpenseCashRecoveryError("CASH_SERVICE_UNAVAILABLE", 503);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.from("cash_events")
    .select("event_id,agency,amount,currency,event_type,direction,source_type,source_id,source_request_id,metadata")
    .or(`source_request_id.eq.${expenseRequestId},source_id.eq.${TARGET_SOURCE_ID}`)
    .limit(3);
  if (error || !data) throw new ExpenseCashRecoveryError("CASH_SERVICE_UNAVAILABLE", 503);
  return data as LinkedCashEvent[];
}
