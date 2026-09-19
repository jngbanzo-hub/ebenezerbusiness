import { createHash } from "node:crypto";

import { z } from "zod";

import { createStockEvent, normalizeParcelCode, type StockEvent } from "../../../../../local-preparation/contracts/stock-event";
import type { CanonicalAgency } from "../../../../../local-preparation/contracts/agencies";

import {
  LogisticsEventProducerError,
  type SupabaseLogisticsEventProducer,
} from "./logistics-event-producer";
import type { LogisticsEventSource } from "./logistics-event-source";

const depositInputSchema = z
  .object({
    trackingCode: z.string(),
    requestId: z.string().trim().min(1).max(128),
    confirmationPhysicalDeposit: z.literal(true),
    evidenceReference: z.string().trim().min(3).max(256).optional(),
  })
  .strict();

export type CooDepositInput = z.infer<typeof depositInputSchema>;

export type AuthoritativeParcel = Readonly<{
  parcelId: string;
  trackingCode: string;
  destination: Exclude<CanonicalAgency, "COO">;
  weightKg: number;
  sourceId: string;
}>;

export interface AuthoritativeParcelResolver {
  resolveByTrackingCode(trackingCode: string): Promise<AuthoritativeParcel | null>;
}

export interface LogisticsEventReplayLookup {
  readEventById(eventId: string): Promise<StockEvent | null>;
}

export type CooDepositActor = Readonly<{
  userId: string;
  site: CanonicalAgency;
}>;

export type CooDepositResult = Readonly<{
  state: "SUCCESS";
  replayed: boolean;
  eventId: string;
  trackingCode: string;
  version: 1;
  agency: "COO";
}>;

export const COO_DEPOSIT_ERROR_CODES = [
  "INVALID_COMMAND",
  "FORBIDDEN",
  "PARCEL_NOT_FOUND",
  "PARCEL_ALREADY_INITIALIZED",
  "IDEMPOTENCY_CONFLICT",
  "SERVICE_UNAVAILABLE",
] as const;

export type CooDepositErrorCode = (typeof COO_DEPOSIT_ERROR_CODES)[number];

export class CooDepositError extends Error {
  constructor(
    readonly code: CooDepositErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CooDepositError";
  }
}

export class CooDepositCommandService {
  constructor(
    private readonly dependencies: Readonly<{
      parcelResolver: AuthoritativeParcelResolver;
      eventSource: LogisticsEventSource;
      replayLookup: LogisticsEventReplayLookup;
      producer: Pick<SupabaseLogisticsEventProducer, "appendEvent">;
      now?: () => Date;
    }>,
  ) {}

  async execute(rawInput: unknown, actor: CooDepositActor): Promise<CooDepositResult> {
    if (actor.site !== "COO") {
      throw commandError("FORBIDDEN", "Seule l’agence COO peut confirmer ce dépôt.");
    }

    const parsed = depositInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw commandError("INVALID_COMMAND", "Commande de dépôt invalide.");
    }

    let trackingCode: string;
    try {
      trackingCode = normalizeParcelCode(parsed.data.trackingCode);
    } catch {
      throw commandError("INVALID_COMMAND", "Code de suivi invalide.");
    }

    const parcel = await this.dependencies.parcelResolver.resolveByTrackingCode(trackingCode);
    if (parcel === null) {
      throw commandError("PARCEL_NOT_FOUND", "Colis introuvable.");
    }
    if (parcel.trackingCode !== trackingCode) {
      throw commandError("SERVICE_UNAVAILABLE", "Source colis incohérente.");
    }

    const eventId = deterministicId("logistics-entry-coo", actor.userId, parsed.data.requestId);
    const fingerprint = commandFingerprint({
      actorId: actor.userId,
      trackingCode,
      parcelId: parcel.parcelId,
      confirmationPhysicalDeposit: true,
      evidenceReference: parsed.data.evidenceReference ?? null,
    });
    const history = await this.dependencies.eventSource.readEventsByTrackingCode(trackingCode);

    if (history !== null) {
      return resolveExisting(history, eventId, fingerprint);
    }

    const occurredAt = (this.dependencies.now ?? (() => new Date()))().toISOString();
    let event: StockEvent;
    try {
      event = createStockEvent({
        eventId,
        parcelId: parcel.parcelId,
        trackingCode,
        eventType: "ENTREE_COO",
        agency: "COO",
        fromAgency: null,
        toAgency: "COO",
        weightKg: parcel.weightKg,
        sourceType: "AGENT",
        sourceId: parcel.sourceId,
        occurredAt,
        recordedAt: occurredAt,
        recordedBy: actor.userId,
        requestId: parsed.data.requestId,
        reason: null,
        metadata: {
          destinationInitiale: parcel.destination,
          commandFingerprint: fingerprint,
          physicalDepositConfirmed: true,
          ...(parsed.data.evidenceReference
            ? { evidenceReference: parsed.data.evidenceReference }
            : {}),
        },
        compensatesEventId: null,
        arrivalMismatch: null,
        versionBefore: 0,
        versionAfter: 1,
      });
    } catch {
      throw commandError("INVALID_COMMAND", "Commande de dépôt invalide.");
    }

    try {
      await this.dependencies.producer.appendEvent([], event);
      return success(event, false);
    } catch (error) {
      if (!(error instanceof LogisticsEventProducerError)) {
        throw commandError("SERVICE_UNAVAILABLE", "Enregistrement du dépôt indisponible.");
      }
      if (error.code !== "DUPLICATE_EVENT") {
        throw commandError("SERVICE_UNAVAILABLE", "Enregistrement du dépôt indisponible.");
      }
      const existing = await this.dependencies.replayLookup.readEventById(eventId);
      if (existing === null) {
        throw commandError("SERVICE_UNAVAILABLE", "Résultat du dépôt indéterminé.");
      }
      return resolveExisting([existing], eventId, fingerprint);
    }
  }
}

function resolveExisting(
  history: readonly StockEvent[],
  eventId: string,
  fingerprint: string,
): CooDepositResult {
  const sameRequest = history.find((event) => event.eventId === eventId);
  if (sameRequest !== undefined) {
    if (
      sameRequest.eventType === "ENTREE_COO" &&
      sameRequest.metadata.commandFingerprint === fingerprint
    ) {
      return success(sameRequest, true);
    }
    throw commandError("IDEMPOTENCY_CONFLICT", "Ce requestId est déjà associé à une autre commande.");
  }
  throw commandError("PARCEL_ALREADY_INITIALIZED", "Ce colis est déjà initialisé.");
}

function success(event: StockEvent, replayed: boolean): CooDepositResult {
  return Object.freeze({
    state: "SUCCESS",
    replayed,
    eventId: event.eventId,
    trackingCode: event.trackingCode,
    version: 1,
    agency: "COO",
  });
}

function deterministicId(namespace: string, actorId: string, requestId: string): string {
  return `${namespace}-${createHash("sha256")
    .update(`${actorId}\u0000${requestId}`)
    .digest("hex")}`;
}

function commandFingerprint(command: unknown): string {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

function commandError(code: CooDepositErrorCode, message: string) {
  return new CooDepositError(code, message);
}
