import assert from "node:assert/strict";
import test from "node:test";

import { OpeningBalanceCommandService, OpeningBalanceError, type AtomicOpeningBalanceCommand, type OpeningBalanceRepository, type OpeningBalanceResult } from "./opening-balance-command";

const actor = { userId: "admin-001", name: "Admin Test", role: "ADMIN" as const };
const baseInput = { agency: "FIH" as const, amount: 125.5, businessDate: "2026-08-01", observation: "Validation initiale", requestId: "opening-fih-001", confirmationFinal: true as const };

class FakeAtomicRepository implements OpeningBalanceRepository {
  private accounts = new Map(["FIH", "LSHI", "KLZ"].map((agency) => [agency, "SUSPENDED"]));
  private requests = new Map<string, { fingerprint: string; result: OpeningBalanceResult }>();
  writes = 0;
  audits = 0;
  async openCashAccount(command: AtomicOpeningBalanceCommand) {
    const fingerprint = JSON.stringify(command);
    const existing = this.requests.get(command.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new OpeningBalanceError("IDEMPOTENCY_CONFLICT", "Conflit");
      return { ...existing.result, replayed: true };
    }
    if (this.accounts.get(command.agency) !== "SUSPENDED") throw new OpeningBalanceError("SECOND_OPENING_NOT_ALLOWED", "Déjà ouverte");
    await Promise.resolve();
    if (this.accounts.get(command.agency) !== "SUSPENDED") throw new OpeningBalanceError("SECOND_OPENING_NOT_ALLOWED", "Déjà ouverte");
    this.accounts.set(command.agency, "ACTIVE");
    this.writes += 1;
    this.audits += 1;
    const result: OpeningBalanceResult = Object.freeze({ state: "SUCCESS", replayed: false, eventId: `event-${command.agency}`, agency: command.agency, amount: command.amount, currency: "USD", businessDate: command.businessDate, accountStatus: "ACTIVE" });
    this.requests.set(command.requestId, { fingerprint, result });
    return result;
  }
  status(agency: string) { return this.accounts.get(agency); }
}

test("ouvre atomiquement uniquement le compte ciblé avec Audit", async () => {
  const repository = new FakeAtomicRepository();
  const result = await new OpeningBalanceCommandService(repository).execute(baseInput, actor);
  assert.equal(result.accountStatus, "ACTIVE");
  assert.equal(repository.writes, 1);
  assert.equal(repository.audits, 1);
  assert.equal(repository.status("FIH"), "ACTIVE");
  assert.equal(repository.status("LSHI"), "SUSPENDED");
  assert.equal(repository.status("KLZ"), "SUSPENDED");
});

test("simule KLZ 472 USD sans coupler FIH ou LSHI", async () => {
  const repository = new FakeAtomicRepository();
  const result = await new OpeningBalanceCommandService(repository).execute({ ...baseInput, agency: "KLZ", amount: 472, requestId: "opening-klz-472" }, actor);
  assert.equal(result.amount, 472);
  assert.equal(repository.status("KLZ"), "ACTIVE");
  assert.equal(repository.status("FIH"), "SUSPENDED");
  assert.equal(repository.status("LSHI"), "SUSPENDED");
});

test("rejoue la même commande sans seconde écriture ni second Audit", async () => {
  const repository = new FakeAtomicRepository(); const service = new OpeningBalanceCommandService(repository);
  const first = await service.execute(baseInput, actor); const replay = await service.execute(baseInput, actor);
  assert.equal(first.replayed, false); assert.equal(replay.replayed, true); assert.equal(replay.eventId, first.eventId);
  assert.equal(repository.writes, 1); assert.equal(repository.audits, 1);
});

test("retourne IDEMPOTENCY_CONFLICT pour le même requestId et un contenu différent", async () => {
  const repository = new FakeAtomicRepository(); const service = new OpeningBalanceCommandService(repository);
  await service.execute(baseInput, actor);
  await assert.rejects(() => service.execute({ ...baseInput, amount: 126 }, actor), isCode("IDEMPOTENCY_CONFLICT"));
});

test("refuse une deuxième ouverture avec un nouveau requestId", async () => {
  const repository = new FakeAtomicRepository(); const service = new OpeningBalanceCommandService(repository);
  await service.execute(baseInput, actor);
  await assert.rejects(() => service.execute({ ...baseInput, requestId: "opening-fih-002" }, actor), isCode("SECOND_OPENING_NOT_ALLOWED"));
});

test("deux Admins concurrents ne peuvent produire qu'une ouverture", async () => {
  const repository = new FakeAtomicRepository(); const service = new OpeningBalanceCommandService(repository);
  const settled = await Promise.allSettled([
    service.execute({ ...baseInput, requestId: "opening-race-001" }, actor),
    service.execute({ ...baseInput, requestId: "opening-race-002" }, { ...actor, userId: "admin-002" }),
  ]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(settled.filter((result) => result.status === "rejected").length, 1);
  assert.equal(repository.writes, 1); assert.equal(repository.audits, 1);
});

test("refuse COO, confirmation absente, date ou requestId invalides", async () => {
  const service = new OpeningBalanceCommandService(new FakeAtomicRepository());
  for (const invalid of [{ ...baseInput, agency: "COO" }, { ...baseInput, confirmationFinal: false }, { ...baseInput, businessDate: "2026-02-30" }, { ...baseInput, requestId: "bad id" }]) await assert.rejects(() => service.execute(invalid, actor), isCode("INVALID_COMMAND"));
});

function isCode(code: string) { return (error: unknown) => error instanceof OpeningBalanceError && error.code === code; }
