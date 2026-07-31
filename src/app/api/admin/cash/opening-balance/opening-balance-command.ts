import { createHash } from "node:crypto";

import { z } from "zod";

export const CASH_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;
export type CashAgency = (typeof CASH_AGENCIES)[number];

const inputSchema = z.object({
  agency: z.enum(CASH_AGENCIES),
  amount: z.number().positive().refine((value) => Math.round(value * 100) === value * 100),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate),
  observation: z.string().trim().max(500).optional(),
  requestId: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  confirmationFinal: z.literal(true),
}).strict();

export type OpeningBalanceActor = Readonly<{ userId: string; name: string; role: "ADMIN" }>;
export type CashAccountRecord = Readonly<{ id: string; agency: CashAgency; currency: "USD"; status: "ACTIVE" | "SUSPENDED" | "CLOSED"; version: number }>;
export type OpeningBalanceRecord = Readonly<{
  eventId: string; accountId: string; agency: CashAgency; amount: number; businessDate: string;
  requestId: string; actorUserId: string; fingerprint: string;
}>;
export type NewOpeningBalanceRecord = OpeningBalanceRecord & Readonly<{
  occurredAt: string; actorName: string; observation: string | null;
}>;

export interface OpeningBalanceRepository {
  findAccount(agency: CashAgency): Promise<CashAccountRecord | null>;
  findByRequestId(requestId: string): Promise<OpeningBalanceRecord | null>;
  findByAccountId(accountId: string): Promise<OpeningBalanceRecord | null>;
  insertOpeningBalance(record: NewOpeningBalanceRecord): Promise<void>;
  activateAccount(accountId: string): Promise<"ACTIVATED" | "ALREADY_ACTIVE" | "FAILED">;
}

export type OpeningBalanceResult = Readonly<{
  state: "SUCCESS"; replayed: boolean; eventId: string; agency: CashAgency;
  amount: number; currency: "USD"; businessDate: string; accountStatus: "ACTIVE";
}>;

export type OpeningBalanceErrorCode = "INVALID_COMMAND" | "ACCOUNT_NOT_READY" |
  "OPENING_BALANCE_ALREADY_DEFINED" | "IDEMPOTENCY_CONFLICT" | "SERVICE_UNAVAILABLE";

export class OpeningBalanceError extends Error {
  constructor(readonly code: OpeningBalanceErrorCode, message: string) {
    super(message);
    this.name = "OpeningBalanceError";
  }
}

export class OpeningBalanceDuplicateError extends Error {}

export class OpeningBalanceCommandService {
  constructor(private readonly repository: OpeningBalanceRepository, private readonly now: () => Date = () => new Date()) {}

  async execute(rawInput: unknown, actor: OpeningBalanceActor): Promise<OpeningBalanceResult> {
    if (actor.role !== "ADMIN" || !actor.userId.trim() || !actor.name.trim()) throw failure("INVALID_COMMAND", "Identité Admin invalide.");
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) throw failure("INVALID_COMMAND", "Commande de solde initial invalide.");
    const command = parsed.data;
    const observation = command.observation?.trim() || null;
    const fingerprint = hash({ agency: command.agency, amount: command.amount, businessDate: command.businessDate, observation, actorUserId: actor.userId });

    const replay = await this.repository.findByRequestId(command.requestId);
    if (replay) return this.resolveReplay(replay, fingerprint);

    const account = await this.repository.findAccount(command.agency);
    if (!account || account.currency !== "USD" || account.status !== "SUSPENDED" || account.version !== 1) {
      throw failure("ACCOUNT_NOT_READY", "Le compte de caisse n’est pas disponible pour son solde initial.");
    }
    if (await this.repository.findByAccountId(account.id)) {
      throw failure("OPENING_BALANCE_ALREADY_DEFINED", "Le solde initial de cette agence est déjà défini.");
    }

    const record: NewOpeningBalanceRecord = Object.freeze({
      eventId: deterministicId(actor.userId, command.requestId), accountId: account.id,
      agency: command.agency, amount: command.amount, businessDate: command.businessDate,
      requestId: command.requestId, actorUserId: actor.userId, actorName: actor.name,
      occurredAt: this.now().toISOString(), observation, fingerprint,
    });
    try {
      await this.repository.insertOpeningBalance(record);
    } catch (error) {
      if (!(error instanceof OpeningBalanceDuplicateError)) throw failure("SERVICE_UNAVAILABLE", "Enregistrement du solde initial indisponible.");
      const racedReplay = await this.repository.findByRequestId(command.requestId);
      if (racedReplay) return this.resolveReplay(racedReplay, fingerprint);
      if (await this.repository.findByAccountId(account.id)) throw failure("OPENING_BALANCE_ALREADY_DEFINED", "Le solde initial de cette agence est déjà défini.");
      throw failure("SERVICE_UNAVAILABLE", "Résultat du solde initial indéterminé.");
    }

    const activation = await this.repository.activateAccount(account.id);
    if (activation === "FAILED") throw failure("SERVICE_UNAVAILABLE", "Activation du compte de caisse indisponible.");
    return success(record, false);
  }

  private async resolveReplay(record: OpeningBalanceRecord, fingerprint: string) {
    if (record.fingerprint !== fingerprint) throw failure("IDEMPOTENCY_CONFLICT", "Ce requestId est déjà associé à une autre commande.");
    const activation = await this.repository.activateAccount(record.accountId);
    if (activation === "FAILED") throw failure("SERVICE_UNAVAILABLE", "Reprise de l’activation indisponible.");
    return success(record, true);
  }
}

function success(record: OpeningBalanceRecord, replayed: boolean): OpeningBalanceResult {
  return Object.freeze({ state: "SUCCESS", replayed, eventId: record.eventId, agency: record.agency, amount: record.amount, currency: "USD", businessDate: record.businessDate, accountStatus: "ACTIVE" });
}
function deterministicId(actorId: string, requestId: string) { return `cash-opening-${createHash("sha256").update(`${actorId}\u0000${requestId}`).digest("hex")}`; }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function isCalendarDate(value: string) { const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value; }
function failure(code: OpeningBalanceErrorCode, message: string) { return new OpeningBalanceError(code, message); }
