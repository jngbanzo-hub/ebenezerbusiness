import { createHash, randomUUID } from "crypto";

import { db } from "@/server/db";
import type {
  ManifestNotificationCandidate,
  NotificationRecipientRole,
  NotificationTemplateName
} from "@/server/notifications/manifest-parser";
import { maskPhone, normalizeManifestStatusSpacing } from "@/server/notifications/manifest-parser";
import type { PublicManifestRow } from "@/server/google-sheets";

export type WhatsAppDeliveryState =
  | "dry_run"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "skipped_invalid_recipient";

export type NotificationLogEntry = {
  id: string;
  dedupKey: string;
  provider: "360dialog" | "green-api" | "meta-cloud" | "dry-run";
  messageId?: string;
  sheetName: string;
  rowNumber: number;
  codeColis: string;
  templateName: NotificationTemplateName;
  recipientRole: NotificationRecipientRole;
  recipientName: string;
  recipientNumberHash: string;
  recipientNumberMasked: string;
  triggerStatus: string;
  dateConcerned: string;
  whatsappStatus: WhatsAppDeliveryState;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  error?: string;
  errorCode?: string;
  errorDescription?: string;
  lastWebhookAt?: string;
};

export type ManifestBaselineEntry = {
  key: string;
  sheetName: string;
  rowNumber: number;
  codeColis: string;
  status: string;
  statusUpdatedAt: string;
  arrivalDate?: string;
};

export type CreateNotificationLogInput = {
  candidate: ManifestNotificationCandidate;
  provider: NotificationLogEntry["provider"];
  status: WhatsAppDeliveryState;
  messageId?: string;
  error?: string;
  errorCode?: string;
  errorDescription?: string;
};

export type NotificationWebhookError = {
  code?: string;
  description?: string;
};

export type NotificationStatusUpdateResult = {
  found: boolean;
  updated: boolean;
  ignoredReason?: "duplicate" | "downgrade" | "unknown_message_id" | "database_unavailable";
  messageId: string;
  requestedStatus: WhatsAppWebhookState;
  previousStatus?: WhatsAppDeliveryState;
  currentStatus?: WhatsAppDeliveryState;
  entry?: NotificationLogEntry;
  databaseUpdated?: boolean;
  databaseError?: string;
};

export type WhatsAppWebhookState = Extract<WhatsAppDeliveryState, "sent" | "delivered" | "read" | "failed">;

type DatabaseNotificationLog = {
  id: string;
  messageId: string | null;
  whatsappStatus: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

type DatabaseNotificationDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  findUnique: (args: { where: { messageId?: string; dedupKey?: string } }) => Promise<DatabaseNotificationLog | null>;
  update: (args: { where: { messageId?: string; dedupKey?: string }; data: Record<string, unknown> }) => Promise<unknown>;
};

const progressStatusRank: Partial<Record<WhatsAppDeliveryState, number>> = {
  sent: 1,
  delivered: 2,
  read: 3
};

class InMemoryNotificationStore {
  private readonly byDedupKey = new Map<string, NotificationLogEntry>();
  private readonly byMessageId = new Map<string, NotificationLogEntry>();
  private readonly baselineByKey = new Map<string, ManifestBaselineEntry>();

  hasDedupKey(dedupKey: string) {
    return this.byDedupKey.has(dedupKey);
  }

  create(input: CreateNotificationLogInput) {
    const existingEntry = this.byDedupKey.get(input.candidate.dedupKey);

    if (existingEntry) {
      return {
        created: false,
        entry: existingEntry
      };
    }

    const now = new Date().toISOString();
    const entry: NotificationLogEntry = {
      id: randomUUID(),
      dedupKey: input.candidate.dedupKey,
      provider: input.provider,
      messageId: input.messageId,
      sheetName: input.candidate.row.sheetName,
      rowNumber: input.candidate.row.rowNumber,
      codeColis: input.candidate.row.codeColis,
      templateName: input.candidate.event.templateName,
      recipientRole: input.candidate.recipient.role,
      recipientName: input.candidate.recipient.contact.name,
      recipientNumberHash: hashPhone(input.candidate.recipient.contact.whatsappNumber),
      recipientNumberMasked: maskPhone(input.candidate.recipient.contact.whatsappNumber),
      triggerStatus: input.candidate.event.triggerStatus,
      dateConcerned: input.candidate.event.dateConcerned,
      whatsappStatus: input.status,
      createdAt: now,
      sentAt: input.status === "sent" || input.status === "dry_run" ? now : undefined,
      deliveredAt: input.status === "delivered" ? now : undefined,
      readAt: input.status === "read" ? now : undefined,
      failedAt: input.status === "failed" || input.status === "skipped_invalid_recipient" ? now : undefined,
      error: input.error,
      errorCode: input.errorCode,
      errorDescription: input.errorDescription
    };

    this.byDedupKey.set(entry.dedupKey, entry);

    if (entry.messageId) {
      this.byMessageId.set(entry.messageId, entry);
    }

    return {
      created: true,
      entry
    };
  }

  updateByMessageId(
    messageId: string,
    status: WhatsAppWebhookState,
    webhookError?: NotificationWebhookError
  ): NotificationStatusUpdateResult {
    const entry = this.byMessageId.get(messageId);

    if (!entry) {
      return {
        found: false,
        updated: false,
        ignoredReason: "unknown_message_id",
        messageId,
        requestedStatus: status
      };
    }

    const previousStatus = entry.whatsappStatus;
    const decision = shouldApplyWebhookStatus(previousStatus, status);

    if (!decision.applyStatus && !decision.recordFailedError) {
      return {
        found: true,
        updated: false,
        ignoredReason: decision.reason,
        messageId,
        requestedStatus: status,
        previousStatus,
        currentStatus: entry.whatsappStatus,
        entry
      };
    }

    const now = new Date().toISOString();
    entry.lastWebhookAt = now;

    if (decision.applyStatus) {
      entry.whatsappStatus = status;
    }

    if (webhookError?.code) {
      entry.errorCode = webhookError.code;
    }

    if (webhookError?.description) {
      entry.errorDescription = webhookError.description;
      entry.error = webhookError.description;
    }

    if (status === "sent" && !entry.sentAt) {
      entry.sentAt = now;
    }

    if (status === "delivered" && !entry.deliveredAt) {
      entry.deliveredAt = now;
    }

    if (status === "read" && !entry.readAt) {
      entry.readAt = now;
    }

    if (status === "failed" && !entry.failedAt) {
      entry.failedAt = now;
    }

    return {
      found: true,
      updated: decision.applyStatus || Boolean(webhookError?.code || webhookError?.description),
      messageId,
      requestedStatus: status,
      previousStatus,
      currentStatus: entry.whatsappStatus,
      entry
    };
  }

  list() {
    return Array.from(this.byDedupKey.values());
  }

  seed(entry: NotificationLogEntry) {
    this.byDedupKey.set(entry.dedupKey, entry);

    if (entry.messageId) {
      this.byMessageId.set(entry.messageId, entry);
    }
  }

  hasBaseline() {
    return this.baselineByKey.size > 0;
  }

  baselineSize() {
    return this.baselineByKey.size;
  }

  getBaseline(row: PublicManifestRow) {
    return this.baselineByKey.get(createManifestBaselineKey(row));
  }

  initializeBaseline(rows: PublicManifestRow[], now: Date) {
    rows.forEach((row) => {
      this.upsertBaseline(row, row.statut, now);
    });

    return this.baselineByKey.size;
  }

  upsertBaseline(row: PublicManifestRow, status: string, now: Date, arrivalDate?: string) {
    const key = createManifestBaselineKey(row);
    const existingEntry = this.baselineByKey.get(key);
    const normalizedStatus = normalizeManifestStatusSpacing(status);
    const entry: ManifestBaselineEntry = {
      key,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      codeColis: row.codeColis,
      status: normalizedStatus,
      statusUpdatedAt:
        existingEntry?.status === normalizedStatus
          ? existingEntry.statusUpdatedAt
          : now.toISOString(),
      arrivalDate: arrivalDate ?? existingEntry?.arrivalDate
    };

    this.baselineByKey.set(key, entry);

    return entry;
  }

  reset() {
    this.byDedupKey.clear();
    this.byMessageId.clear();
    this.baselineByKey.clear();
  }
}

const globalNotificationStore = globalThis as typeof globalThis & {
  __eebNotificationStore?: InMemoryNotificationStore;
};

export function getNotificationStore() {
  globalNotificationStore.__eebNotificationStore ??= new InMemoryNotificationStore();

  return globalNotificationStore.__eebNotificationStore;
}

export function resetNotificationStore() {
  globalNotificationStore.__eebNotificationStore = new InMemoryNotificationStore();

  return globalNotificationStore.__eebNotificationStore;
}

export async function persistNotificationLogEntry(entry: NotificationLogEntry) {
  const delegate = getDatabaseNotificationDelegate();

  if (!delegate) {
    return {
      skipped: true,
      reason: "database_unavailable"
    };
  }

  try {
    await delegate.create({
      data: {
        id: entry.id,
        dedupKey: entry.dedupKey,
        provider: mapProviderToDatabase(entry.provider),
        messageId: entry.messageId,
        sheetName: entry.sheetName,
        rowNumber: entry.rowNumber,
        codeColis: entry.codeColis,
        templateName: entry.templateName,
        recipientRole: mapRoleToDatabase(entry.recipientRole),
        recipientName: entry.recipientName,
        recipientNumberHash: entry.recipientNumberHash,
        recipientNumberMasked: entry.recipientNumberMasked,
        triggerStatus: entry.triggerStatus,
        dateConcerned: entry.dateConcerned || null,
        whatsappStatus: mapStatusToDatabase(entry.whatsappStatus),
        createdAt: parseOptionalDate(entry.createdAt),
        sentAt: parseOptionalDate(entry.sentAt),
        deliveredAt: parseOptionalDate(entry.deliveredAt),
        readAt: parseOptionalDate(entry.readAt),
        failedAt: parseOptionalDate(entry.failedAt),
        error: entry.error,
        errorCode: entry.errorCode,
        errorDescription: entry.errorDescription,
        lastWebhookAt: parseOptionalDate(entry.lastWebhookAt)
      }
    });

    return {
      skipped: false,
      created: true
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        skipped: false,
        created: false,
        duplicate: true
      };
    }

    return {
      skipped: false,
      created: false,
      error: getErrorMessage(error)
    };
  }
}

export async function updateNotificationStatusByMessageId(
  messageId: string,
  status: WhatsAppWebhookState,
  webhookError?: NotificationWebhookError
): Promise<NotificationStatusUpdateResult> {
  const memoryResult = getNotificationStore().updateByMessageId(messageId, status, webhookError);
  const databaseResult = await updateDatabaseNotificationStatus(messageId, status, webhookError);

  if (memoryResult.found) {
    return {
      ...memoryResult,
      databaseUpdated: databaseResult.updated,
      databaseError: databaseResult.error
    };
  }

  if (databaseResult.found) {
    return {
      found: true,
      updated: databaseResult.updated,
      ignoredReason: databaseResult.ignoredReason,
      messageId,
      requestedStatus: status,
      previousStatus: databaseResult.previousStatus,
      currentStatus: databaseResult.currentStatus,
      databaseUpdated: databaseResult.updated,
      databaseError: databaseResult.error
    };
  }

  return {
    ...memoryResult,
    databaseUpdated: databaseResult.updated,
    databaseError: databaseResult.error
  };
}

export function seedNotificationLogEntryForWebhookTest(
  overrides: Partial<NotificationLogEntry> & {
    dedupKey: string;
    messageId: string;
  }
) {
  const store = getNotificationStore();
  const now = new Date().toISOString();
  const entry: NotificationLogEntry = {
    id: randomUUID(),
    provider: "360dialog",
    sheetName: "FIH",
    rowNumber: 999,
    codeColis: "WEBHOOK-TEST",
    templateName: "coli_depose",
    recipientRole: "beneficiaire",
    recipientName: "Destinataire Test",
    recipientNumberHash: hashPhone("22900000000"),
    recipientNumberMasked: "229***00",
    triggerStatus: "Test webhook",
    dateConcerned: "",
    whatsappStatus: "dry_run",
    createdAt: now,
    ...overrides
  };

  store.seed(entry);

  return entry;
}

export function hashPhone(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function shouldApplyWebhookStatus(currentStatus: WhatsAppDeliveryState, nextStatus: WhatsAppWebhookState) {
  if (nextStatus === "failed") {
    return {
      applyStatus:
        currentStatus !== "delivered" && currentStatus !== "read" && currentStatus !== "failed",
      recordFailedError: true as const,
      reason: currentStatus === "failed" ? ("duplicate" as const) : undefined
    };
  }

  if (currentStatus === nextStatus) {
    return {
      applyStatus: false,
      recordFailedError: false as const,
      reason: "duplicate" as const
    };
  }

  const currentRank = progressStatusRank[currentStatus] ?? 0;
  const nextRank = progressStatusRank[nextStatus] ?? 0;

  if (nextRank < currentRank) {
    return {
      applyStatus: false,
      recordFailedError: false as const,
      reason: "downgrade" as const
    };
  }

  return {
    applyStatus: true,
    recordFailedError: false as const
  };
}

function getDatabaseNotificationDelegate(): DatabaseNotificationDelegate | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const prisma = db as unknown as {
    whatsAppNotificationLog?: DatabaseNotificationDelegate;
  };

  return prisma.whatsAppNotificationLog ?? null;
}

async function updateDatabaseNotificationStatus(
  messageId: string,
  status: WhatsAppWebhookState,
  webhookError?: NotificationWebhookError
): Promise<{
  found: boolean;
  updated: boolean;
  ignoredReason?: NotificationStatusUpdateResult["ignoredReason"];
  previousStatus?: WhatsAppDeliveryState;
  currentStatus?: WhatsAppDeliveryState;
  error?: string;
}> {
  const delegate = getDatabaseNotificationDelegate();

  if (!delegate) {
    return {
      found: false,
      updated: false,
      ignoredReason: "database_unavailable"
    };
  }

  try {
    const existingEntry = await delegate.findUnique({
      where: {
        messageId
      }
    });

    if (!existingEntry) {
      return {
        found: false,
        updated: false,
        ignoredReason: "unknown_message_id"
      };
    }

    const previousStatus = mapStatusFromDatabase(existingEntry.whatsappStatus);
    const decision = shouldApplyWebhookStatus(previousStatus, status);

    if (!decision.applyStatus && !decision.recordFailedError) {
      return {
        found: true,
        updated: false,
        ignoredReason: decision.reason,
        previousStatus,
        currentStatus: previousStatus
      };
    }

    const now = new Date();
    const data: Record<string, unknown> = {
      lastWebhookAt: now
    };

    if (decision.applyStatus) {
      data.whatsappStatus = mapStatusToDatabase(status);
    }

    if (status === "sent" && !existingEntry.sentAt) {
      data.sentAt = now;
    }

    if (status === "delivered" && !existingEntry.deliveredAt) {
      data.deliveredAt = now;
    }

    if (status === "read" && !existingEntry.readAt) {
      data.readAt = now;
    }

    if (status === "failed" && !existingEntry.failedAt) {
      data.failedAt = now;
    }

    if (webhookError?.code) {
      data.errorCode = webhookError.code;
    }

    if (webhookError?.description) {
      data.errorDescription = webhookError.description;
      data.error = webhookError.description;
    }

    await delegate.update({
      where: {
        messageId
      },
      data
    });

    return {
      found: true,
      updated: decision.applyStatus || Boolean(webhookError?.code || webhookError?.description),
      previousStatus,
      currentStatus: decision.applyStatus ? status : previousStatus
    };
  } catch (error) {
    return {
      found: false,
      updated: false,
      error: getErrorMessage(error)
    };
  }
}

function mapProviderToDatabase(provider: NotificationLogEntry["provider"]) {
  const providers: Record<NotificationLogEntry["provider"], string> = {
    "360dialog": "DIALOG360",
    "green-api": "GREEN_API",
    "meta-cloud": "META_CLOUD",
    "dry-run": "DRY_RUN"
  };

  return providers[provider];
}

function mapRoleToDatabase(role: NotificationRecipientRole) {
  return role === "expediteur" ? "EXPEDITEUR" : "BENEFICIAIRE";
}

function mapStatusToDatabase(status: WhatsAppDeliveryState) {
  return status.toUpperCase();
}

function mapStatusFromDatabase(status: string): WhatsAppDeliveryState {
  return status.toLowerCase() as WhatsAppDeliveryState;
}

function parseOptionalDate(value: string | undefined) {
  return value ? new Date(value) : undefined;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur inconnue.";
}

function createManifestBaselineKey(row: PublicManifestRow) {
  return [row.sheetName, row.codeColis.trim().toUpperCase()].join("|");
}
