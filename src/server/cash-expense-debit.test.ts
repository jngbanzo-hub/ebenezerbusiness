import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorizedAgentIdentity } from "./agent-authorization";
import {
  attachConfirmedExpenseDebit,
  CashExpenseDebitError,
  type ExpenseDebitWriter
} from "./cash-expense-debit";

const requestIdA = "11111111-1111-4111-8111-111111111111";
const requestIdB = "22222222-2222-4222-8222-222222222222";
const confirmed = { success: true, code: "DEPENSE_ENREGISTREE" };

function identity(
  site: "COO" | "FIH" | "LSHI" | "KLZ",
  userId = "11111111-aaaa-4aaa-8aaa-111111111111"
): AuthorizedAgentIdentity {
  return {
    userId,
    email: `${userId}@test.local`,
    nom: `Agent ${userId}`,
    role: "AGENT",
    agence: site === "COO" ? "COTONOU" : site,
    site
  };
}

function expense(expenseRequestId = requestIdA, amount = 25) {
  return {
    action: "ENREGISTRER_DEPENSE" as const,
    donnees: {
      expenseRequestId,
      categorie: "Transport",
      description: "Course agence",
      montant: amount,
      devise: "USD",
      modePaiement: "ESPÈCES",
      reference: "FACTURE-01",
      observation: ""
    }
  };
}

class FakeWriter {
  readonly rows = new Map<string, { fingerprint: string; source: string }>();
  readonly write: ExpenseDebitWriter = async (input) => {
    const existing = this.rows.get(input.expenseRequestId);
    if (existing) {
      if (existing.fingerprint !== input.commandFingerprint) {
        throw new CashExpenseDebitError("IDEMPOTENCY_CONFLICT", 409);
      }
      return { replayed: true };
    }
    if (!input.allowCreate) {
      throw new CashExpenseDebitError("CASH_SERVICE_UNAVAILABLE", 503);
    }
    if (Array.from(this.rows.values()).some((row) => row.source === input.expenseReference)) {
      return { replayed: true };
    }
    this.rows.set(input.expenseRequestId, {
      fingerprint: input.commandFingerprint,
      source: input.expenseReference
    });
    return { replayed: false };
  };
}

const options = (writer: FakeWriter) => ({
  enabled: true,
  now: () => new Date("2026-08-01T10:00:00.000Z"),
  writer: writer.write
});

test("deux dépenses simultanées d'une agence produisent deux débits", async () => {
  const writer = new FakeWriter();
  const [first, second] = await Promise.all([
    attachConfirmedExpenseDebit(identity("LSHI", "agent-a"), expense(requestIdA), confirmed, options(writer)),
    attachConfirmedExpenseDebit(identity("LSHI", "agent-b"), expense(requestIdB, 40), confirmed, options(writer))
  ]);
  assert.equal((first as { replayed: boolean }).replayed, false);
  assert.equal((second as { replayed: boolean }).replayed, false);
  assert.equal(writer.rows.size, 2);
});

test("même dépense rejouée ne produit aucun second débit", async () => {
  const writer = new FakeWriter();
  await attachConfirmedExpenseDebit(identity("FIH"), expense(), confirmed, options(writer));
  const replay = await attachConfirmedExpenseDebit(
    identity("FIH"),
    expense(),
    { success: true, code: "DEPENSE_DEJA_ENREGISTREE" },
    options(writer)
  );
  assert.equal((replay as { replayed: boolean }).replayed, true);
  assert.equal(writer.rows.size, 1);
});

test("un doublon Apps Script isolé ne peut pas créer le premier débit", async () => {
  const writer = new FakeWriter();
  await assert.rejects(
    () => attachConfirmedExpenseDebit(
      identity("FIH"),
      expense(),
      { success: true, code: "DEPENSE_DEJA_ENREGISTREE" },
      options(writer)
    ),
    (error) => error instanceof CashExpenseDebitError && error.code === "CASH_SERVICE_UNAVAILABLE"
  );
  assert.equal(writer.rows.size, 0);
});

test("même requestId avec contenu différent produit IDEMPOTENCY_CONFLICT", async () => {
  const writer = new FakeWriter();
  await attachConfirmedExpenseDebit(identity("KLZ"), expense(), confirmed, options(writer));
  await assert.rejects(
    () => attachConfirmedExpenseDebit(identity("KLZ"), expense(requestIdA, 26), confirmed, options(writer)),
    (error) => error instanceof CashExpenseDebitError && error.code === "IDEMPOTENCY_CONFLICT"
  );
  assert.equal(writer.rows.size, 1);
});

test("deux acteurs tentant la même dépense conservent un seul débit", async () => {
  const writer = new FakeWriter();
  await attachConfirmedExpenseDebit(identity("LSHI", "agent-a"), expense(), confirmed, options(writer));
  const replay = await attachConfirmedExpenseDebit(
    identity("LSHI", "agent-b"),
    expense(),
    { success: true, code: "DEPENSE_DEJA_ENREGISTREE" },
    options(writer)
  );
  assert.equal((replay as { replayed: boolean }).replayed, true);
  assert.equal(writer.rows.size, 1);
});

test("COO et les devises historiques restent hors caisse", async () => {
  const writer = new FakeWriter();
  const coo = await attachConfirmedExpenseDebit(identity("COO"), expense(), confirmed, options(writer));
  const legacy = expense();
  legacy.donnees.devise = "CDF";
  await attachConfirmedExpenseDebit(identity("FIH"), legacy, confirmed, options(writer));
  assert.equal((coo as { replayed: boolean }).replayed, false);
  assert.equal(writer.rows.size, 0);
});

test("flag désactivé et résultat non confirmé préservent Dépenses", async () => {
  const writer = new FakeWriter();
  const unchanged = await attachConfirmedExpenseDebit(identity("FIH"), expense(), confirmed, {
    ...options(writer),
    enabled: false
  });
  const refused = { success: false, code: "DEPENSE_REFUSEE" };
  assert.equal(await attachConfirmedExpenseDebit(identity("FIH"), expense(), refused, options(writer)), refused);
  assert.equal(unchanged, confirmed);
  assert.equal(writer.rows.size, 0);
});
