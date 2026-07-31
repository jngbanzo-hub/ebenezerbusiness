import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import type { AuthorizedAgentIdentity } from "@/server/agent-authorization";

type ExpenseRequest = Readonly<{
  action: "ENREGISTRER_DEPENSE" | "DEMANDER_CORRECTION";
  donnees: Record<string, unknown>;
}>;

type ExpenseDebitResult = Readonly<{ replayed: boolean }>;

export type ExpenseDebitWriter = (input: Readonly<{
  actorName: string;
  actorUserId: string;
  agency: "FIH" | "LSHI" | "KLZ";
  allowCreate: boolean;
  amount: number;
  businessDate: string;
  category: string;
  commandFingerprint: string;
  expenseReference: string;
  expenseRequestId: string;
  metadata: Readonly<Record<string, string | number | null>>;
  occurredAt: string;
}>) => Promise<ExpenseDebitResult>;

export class CashExpenseDebitError extends Error {
  constructor(
    readonly code: "IDEMPOTENCY_CONFLICT" | "CASH_SERVICE_UNAVAILABLE",
    readonly status: 409 | 503
  ) {
    super(code);
    this.name = "CashExpenseDebitError";
  }
}

export async function attachConfirmedExpenseDebit(
  identity: AuthorizedAgentIdentity,
  request: ExpenseRequest,
  upstreamResult: unknown,
  options: Readonly<{
    enabled?: boolean;
    now?: () => Date;
    writer?: ExpenseDebitWriter;
  }> = {}
): Promise<unknown> {
  const enabled =
    options.enabled ??
    process.env.CASH_EXPENSE_DEBITS_ENABLED?.trim().toLowerCase() === "true";
  if (!enabled || request.action !== "ENREGISTRER_DEPENSE") {
    return upstreamResult;
  }
  if (!isConfirmedExpense(upstreamResult)) {
    return upstreamResult;
  }

  // Cotonou conserve ses dépenses hors caisse, financées directement par le PDG.
  if (identity.site === "COO") {
    return { ...upstreamResult, replayed: false };
  }
  if (!isCashAgency(identity.site)) {
    throw new CashExpenseDebitError("CASH_SERVICE_UNAVAILABLE", 503);
  }

  const expense = readUsdExpense(request.donnees);
  if (expense === null) {
    // Les devises historiques restent dans Dépenses et n'entrent jamais en Caisse.
    return upstreamResult;
  }

  const occurredAt = (options.now ?? (() => new Date()))().toISOString();
  const commandFingerprint = fingerprint({
    agency: identity.site,
    amount: expense.amount,
    category: expense.category,
    currency: "USD",
    description: expense.description,
    expenseReference: expense.reference,
    expenseRequestId: expense.expenseRequestId,
    modePaiement: expense.modePaiement,
    observation: expense.observation
  });
  const writer = options.writer ?? createSupabaseExpenseDebitWriter();
  const debit = await writer({
    actorName: identity.nom,
    actorUserId: identity.userId,
    agency: identity.site,
    allowCreate: upstreamResult.code === "DEPENSE_ENREGISTREE",
    amount: expense.amount,
    businessDate: businessDateInPortoNovo(new Date(occurredAt)),
    category: expense.category,
    commandFingerprint,
    expenseReference: expense.expenseRequestId,
    expenseRequestId: expense.expenseRequestId,
    metadata: {
      category: expense.category,
      description: expense.description,
      modePaiement: expense.modePaiement,
      observation: expense.observation,
      reference: expense.reference,
      source: "DEPENSES_PUBLIC"
    },
    occurredAt
  });

  return { ...upstreamResult, replayed: debit.replayed };
}

function createSupabaseExpenseDebitWriter(): ExpenseDebitWriter {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new CashExpenseDebitError("CASH_SERVICE_UNAVAILABLE", 503);
  }
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  return async (input) => {
    const { data, error } = await client.rpc("record_cash_expense_debit", {
      p_actor_name: input.actorName,
      p_actor_user_id: input.actorUserId,
      p_agency: input.agency,
      p_allow_create: input.allowCreate,
      p_amount: input.amount,
      p_business_date: input.businessDate,
      p_category: input.category,
      p_command_fingerprint: input.commandFingerprint,
      p_expense_reference: input.expenseReference,
      p_expense_request_id: input.expenseRequestId,
      p_metadata: input.metadata,
      p_occurred_at: input.occurredAt
    });
    if (error) {
      if (String(error.message).includes("IDEMPOTENCY_CONFLICT")) {
        throw new CashExpenseDebitError("IDEMPOTENCY_CONFLICT", 409);
      }
      throw new CashExpenseDebitError("CASH_SERVICE_UNAVAILABLE", 503);
    }
    if (!isRecord(data) || typeof data.replayed !== "boolean") {
      throw new CashExpenseDebitError("CASH_SERVICE_UNAVAILABLE", 503);
    }
    return { replayed: data.replayed };
  };
}

function readUsdExpense(value: Record<string, unknown>) {
  if (value.devise !== "USD") return null;
  if (
    typeof value.expenseRequestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.expenseRequestId
    ) ||
    typeof value.montant !== "number" ||
    !Number.isFinite(value.montant) ||
    value.montant <= 0 ||
    Math.round(value.montant * 100) !== value.montant * 100 ||
    typeof value.categorie !== "string" ||
    value.categorie.trim() === ""
  ) {
    throw new CashExpenseDebitError("CASH_SERVICE_UNAVAILABLE", 503);
  }
  return {
    amount: value.montant,
    category: value.categorie.trim(),
    description: text(value.description),
    expenseRequestId: value.expenseRequestId.toLowerCase(),
    modePaiement: text(value.modePaiement),
    observation: text(value.observation),
    reference: text(value.reference)
  };
}

function isConfirmedExpense(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.success === true &&
    (value.code === "DEPENSE_ENREGISTREE" ||
      value.code === "DEPENSE_DEJA_ENREGISTREE")
  );
}

function businessDateInPortoNovo(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Porto-Novo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function fingerprint(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isCashAgency(value: string): value is "FIH" | "LSHI" | "KLZ" {
  return value === "FIH" || value === "LSHI" || value === "KLZ";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
