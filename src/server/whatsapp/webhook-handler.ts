import {
  updateNotificationStatusByMessageId,
  type NotificationWebhookError,
  type WhatsAppWebhookState
} from "@/server/notifications/notification-store";

export type Dialog360WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Dialog360StatusObject[];
        messages?: unknown[];
      };
    }>;
  }>;
  statuses?: Dialog360StatusObject[];
  messages?: unknown[];
};

export type Dialog360StatusObject = {
  id?: string;
  status?: string;
  recipient_id?: string;
  timestamp?: string | number;
  errors?: Dialog360StatusError[];
};

type Dialog360StatusError = {
  code?: string | number;
  title?: string;
  message?: string;
  details?: string;
  error_data?: {
    details?: string;
  };
};

export type Dialog360WebhookProcessResult = {
  ok: true;
  receivedStatuses: number;
  processedStatuses: number;
  updated: number;
  ignored: number;
  incomingMessages: number;
  unknownMessageIds: string[];
  events: Array<{
    messageId?: string;
    status?: string;
    mappedStatus?: WhatsAppWebhookState;
    result: "updated" | "duplicate" | "downgrade" | "unknown_message_id" | "ignored";
    errorCode?: string;
    errorDescription?: string;
  }>;
};

export async function handleDialog360WebhookPayload(
  payload: Dialog360WebhookPayload
): Promise<Dialog360WebhookProcessResult> {
  const statuses = extractStatuses(payload);
  const incomingMessages = extractIncomingMessages(payload);
  const events: Dialog360WebhookProcessResult["events"] = [];
  const unknownMessageIds: string[] = [];
  let updated = 0;
  let ignored = 0;
  let processedStatuses = 0;

  for (const statusObject of statuses) {
    const messageId = statusObject.id?.trim();
    const mappedStatus = mapDialog360Status(statusObject.status);
    const webhookError = getWebhookError(statusObject);

    if (!messageId || !mappedStatus) {
      ignored += 1;
      events.push({
        messageId,
        status: statusObject.status,
        result: "ignored",
        errorCode: webhookError.code,
        errorDescription: webhookError.description
      });
      continue;
    }

    processedStatuses += 1;

    const updateResult = await updateNotificationStatusByMessageId(
      messageId,
      mappedStatus,
      webhookError
    );

    if (updateResult.updated) {
      updated += 1;
    } else {
      ignored += 1;
    }

    if (!updateResult.found) {
      unknownMessageIds.push(maskMessageId(messageId));
    }

    events.push({
      messageId: maskMessageId(messageId),
      status: statusObject.status,
      mappedStatus,
      result: mapUpdateResultToWebhookEvent(updateResult.ignoredReason, updateResult.updated),
      errorCode: webhookError.code,
      errorDescription: webhookError.description
    });
  }

  return {
    ok: true,
    receivedStatuses: statuses.length,
    processedStatuses,
    updated,
    ignored,
    incomingMessages: incomingMessages.length,
    unknownMessageIds,
    events
  };
}

export function extractStatuses(payload: Dialog360WebhookPayload) {
  const nestedStatuses =
    payload.entry?.flatMap(
      (entry) => entry.changes?.flatMap((change) => change.value?.statuses ?? []) ?? []
    ) ?? [];

  return [...(payload.statuses ?? []), ...nestedStatuses];
}

export function extractIncomingMessages(payload: Dialog360WebhookPayload) {
  const nestedMessages =
    payload.entry?.flatMap(
      (entry) => entry.changes?.flatMap((change) => change.value?.messages ?? []) ?? []
    ) ?? [];

  return [...(payload.messages ?? []), ...nestedMessages];
}

function mapDialog360Status(value: string | undefined): WhatsAppWebhookState | null {
  if (value === "sent" || value === "delivered" || value === "read" || value === "failed") {
    return value;
  }

  return null;
}

function getWebhookError(statusObject: Dialog360StatusObject): NotificationWebhookError {
  const firstError = statusObject.errors?.[0];

  if (!firstError) {
    return {};
  }

  return {
    code: firstError.code === undefined ? undefined : String(firstError.code),
    description:
      firstError.title ??
      firstError.message ??
      firstError.details ??
      firstError.error_data?.details ??
      undefined
  };
}

function mapUpdateResultToWebhookEvent(
  ignoredReason: "duplicate" | "downgrade" | "unknown_message_id" | "database_unavailable" | undefined,
  updated: boolean
) {
  if (updated) {
    return "updated";
  }

  if (ignoredReason === "duplicate" || ignoredReason === "downgrade" || ignoredReason === "unknown_message_id") {
    return ignoredReason;
  }

  return "ignored";
}

export function maskMessageId(messageId: string) {
  if (messageId.length <= 12) {
    return "***";
  }

  return `${messageId.slice(0, 10)}…${messageId.slice(-6)}`;
}
