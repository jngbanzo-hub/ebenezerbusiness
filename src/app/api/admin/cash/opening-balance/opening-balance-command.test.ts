import assert from "node:assert/strict";
import test from "node:test";

import { OpeningBalanceCommandService, OpeningBalanceDuplicateError, OpeningBalanceError, type CashAccountRecord, type NewOpeningBalanceRecord, type OpeningBalanceRecord, type OpeningBalanceRepository } from "./opening-balance-command";

const actor = { userId: "admin-001", name: "Admin Test", role: "ADMIN" as const };
const baseInput = { agency: "FIH" as const, amount: 125.5, businessDate: "2026-08-01", observation: "Validation initiale", requestId: "opening-fih-001", confirmationFinal: true as const };

class FakeRepository implements OpeningBalanceRepository {
  accounts = new Map<string, CashAccountRecord>([
    ["FIH", { id: "account-fih", agency: "FIH", currency: "USD", status: "SUSPENDED", version: 1 }],
    ["LSHI", { id: "account-lshi", agency: "LSHI", currency: "USD", status: "SUSPENDED", version: 1 }],
    ["KLZ", { id: "account-klz", agency: "KLZ", currency: "USD", status: "SUSPENDED", version: 1 }],
  ]);
  events: NewOpeningBalanceRecord[] = [];
  duplicateNext = false;
  async findAccount(agency: "FIH" | "LSHI" | "KLZ") { return this.accounts.get(agency) ?? null; }
  async findByRequestId(requestId: string) { return this.events.find((event) => event.requestId === requestId) ?? null; }
  async findByAccountId(accountId: string) { return this.events.find((event) => event.accountId === accountId) ?? null; }
  async insertOpeningBalance(record: NewOpeningBalanceRecord) { if (this.duplicateNext) throw new OpeningBalanceDuplicateError(); this.events.push(record); }
  async activateAccount(accountId: string) { const entry = Array.from(this.accounts.entries()).find(([, value]) => value.id === accountId); if (!entry) return "FAILED" as const; if (entry[1].status === "ACTIVE") return "ALREADY_ACTIVE" as const; this.accounts.set(entry[0], { ...entry[1], status: "ACTIVE" }); return "ACTIVATED" as const; }
}

test("crée un événement d'ouverture puis active uniquement le compte ciblé", async () => {
  const repository = new FakeRepository();
  const result = await new OpeningBalanceCommandService(repository, () => new Date("2026-08-01T10:00:00Z")).execute(baseInput, actor);
  assert.equal(result.replayed, false); assert.equal(result.accountStatus, "ACTIVE"); assert.equal(repository.events.length, 1);
  assert.deepEqual({ agency: repository.events[0].agency, amount: repository.events[0].amount, businessDate: repository.events[0].businessDate, actor: repository.events[0].actorUserId, observation: repository.events[0].observation }, { agency: "FIH", amount: 125.5, businessDate: "2026-08-01", actor: actor.userId, observation: "Validation initiale" });
  assert.equal(repository.accounts.get("LSHI")?.status, "SUSPENDED");
});

test("rejoue la même commande sans second événement", async () => {
  const repository = new FakeRepository(); const service = new OpeningBalanceCommandService(repository);
  const first = await service.execute(baseInput, actor); const replay = await service.execute(baseInput, actor);
  assert.equal(first.replayed, false); assert.equal(replay.replayed, true); assert.equal(replay.eventId, first.eventId); assert.equal(repository.events.length, 1);
});

test("retourne IDEMPOTENCY_CONFLICT pour le même requestId et un contenu différent", async () => {
  const repository = new FakeRepository(); const service = new OpeningBalanceCommandService(repository);
  await service.execute(baseInput, actor);
  await assert.rejects(() => service.execute({ ...baseInput, amount: 126 }, actor), isCode("IDEMPOTENCY_CONFLICT"));
});

test("empêche un deuxième solde initial pour la même agence", async () => {
  const repository = new FakeRepository(); const service = new OpeningBalanceCommandService(repository);
  await service.execute(baseInput, actor);
  repository.accounts.set("FIH", { ...repository.accounts.get("FIH")!, status: "SUSPENDED" });
  await assert.rejects(() => service.execute({ ...baseInput, requestId: "opening-fih-002" }, actor), isCode("OPENING_BALANCE_ALREADY_DEFINED"));
});

test("gère indépendamment FIH, LSHI et KLZ", async () => {
  const repository = new FakeRepository(); const service = new OpeningBalanceCommandService(repository);
  const agencies = ["FIH", "LSHI", "KLZ"] as const;
  for (let index = 0; index < agencies.length; index += 1) { const agency = agencies[index]; await service.execute({ ...baseInput, agency, requestId: `opening-${agency}-${index}` }, actor); }
  assert.deepEqual(repository.events.map((event) => event.agency).sort(), ["FIH", "KLZ", "LSHI"]); assert.equal(repository.events.length, 3);
});

test("refuse COO, confirmation absente, date ou requestId invalides", async () => {
  const service = new OpeningBalanceCommandService(new FakeRepository());
  for (const invalid of [{ ...baseInput, agency: "COO" }, { ...baseInput, confirmationFinal: false }, { ...baseInput, businessDate: "2026-02-30" }, { ...baseInput, requestId: "bad id" }]) await assert.rejects(() => service.execute(invalid, actor), isCode("INVALID_COMMAND"));
});

test("refuse un compte non suspendu", async () => {
  const repository = new FakeRepository(); repository.accounts.set("FIH", { ...repository.accounts.get("FIH")!, status: "ACTIVE" });
  await assert.rejects(() => new OpeningBalanceCommandService(repository).execute(baseInput, actor), isCode("ACCOUNT_NOT_READY"));
});

function isCode(code: string) { return (error: unknown) => error instanceof OpeningBalanceError && error.code === code; }
