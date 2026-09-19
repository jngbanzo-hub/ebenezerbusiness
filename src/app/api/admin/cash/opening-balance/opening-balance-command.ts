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
export type AtomicOpeningBalanceCommand = Readonly<{
  agency: CashAgency; amount: number; businessDate: string; observation: string | null;
  requestId: string; actorUserId: string;
}>;

export interface OpeningBalanceRepository {
  openCashAccount(command: AtomicOpeningBalanceCommand): Promise<OpeningBalanceResult>;
}

export type OpeningBalanceResult = Readonly<{
  state: "SUCCESS"; replayed: boolean; eventId: string; agency: CashAgency;
  amount: number; currency: "USD"; businessDate: string; accountStatus: "ACTIVE";
}>;

export type OpeningBalanceErrorCode = "INVALID_COMMAND" | "ACCOUNT_NOT_READY" |
  "OPENING_BALANCE_ALREADY_DEFINED" | "SECOND_OPENING_NOT_ALLOWED" |
  "IDEMPOTENCY_CONFLICT" | "SERVICE_UNAVAILABLE";

export class OpeningBalanceError extends Error {
  constructor(readonly code: OpeningBalanceErrorCode, message: string) {
    super(message);
    this.name = "OpeningBalanceError";
  }
}

export class OpeningBalanceCommandService {
  constructor(private readonly repository: OpeningBalanceRepository) {}

  async execute(rawInput: unknown, actor: OpeningBalanceActor): Promise<OpeningBalanceResult> {
    if (actor.role !== "ADMIN" || !actor.userId.trim() || !actor.name.trim()) throw failure("INVALID_COMMAND", "Identité Admin invalide.");
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) throw failure("INVALID_COMMAND", "Commande de solde initial invalide.");
    const command = parsed.data;
    const observation = command.observation?.trim() || null;
    try {
      return await this.repository.openCashAccount(Object.freeze({
        agency: command.agency,
        amount: command.amount,
        businessDate: command.businessDate,
        observation,
        requestId: command.requestId,
        actorUserId: actor.userId,
      }));
    } catch (error) {
      if (error instanceof OpeningBalanceError) throw error;
      throw failure("SERVICE_UNAVAILABLE", "Ouverture atomique de la caisse indisponible.");
    }
  }
}
function isCalendarDate(value: string) { const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value; }
function failure(code: OpeningBalanceErrorCode, message: string) { return new OpeningBalanceError(code, message); }
