import type { TransferSummary } from "@/features/transferts/types";
import { recordInternalNotification, type NotificationAgency, type NotificationAudience } from "@/server/internal-notifications";

type Actor = Readonly<{ userId: string; name: string }>;
type TransferNotification = Readonly<{ eventKey: string; agency: NotificationAgency; audience: NotificationAudience; title: string; message: string }>;

export function buildTransferCreatedNotifications(transfer: TransferSummary, actor: Actor): readonly TransferNotification[] {
  const details = `${transfer.agencyFrom} → ${transfer.agencyTo} — ${transfer.amount} ${transfer.currency} — frais ${transfer.fees} — ${transfer.service} — bénéficiaire ${transfer.beneficiaryName}`;
  return [
    { eventKey: `transfer_created:${transfer.transferId}:beneficiary_agency`, agency: transfer.agencyTo, audience: "AGENT", title: "Nouveau transfert reçu", message: `Un transfert de ${transfer.agencyFrom} vers ${transfer.agencyTo} vient d’être créé. ${details} — Agent ${actor.name}.` },
    { eventKey: `transfer_created:${transfer.transferId}:admin`, agency: transfer.agencyTo, audience: "ADMIN", title: "Nouveau transfert inter-agence", message: `${transfer.agencyFrom} → ${transfer.agencyTo} — transfert créé par ${actor.name}. ${details}.` }
  ];
}

export function buildTransferWithdrawnNotifications(transfer: TransferSummary, actor: Actor): readonly TransferNotification[] {
  const details = `${transfer.transferId} — ${transfer.amount} ${transfer.currency} — bénéficiaire ${transfer.beneficiaryName}`;
  return [
    { eventKey: `transfer_withdrawn:${transfer.transferId}:source_agency`, agency: transfer.agencyFrom, audience: "AGENT", title: "Transfert retiré", message: `Le transfert envoyé vers ${transfer.agencyTo} a été remis au bénéficiaire. ${details} — confirmé par ${actor.name}.` },
    { eventKey: `transfer_withdrawn:${transfer.transferId}:admin`, agency: transfer.agencyFrom, audience: "ADMIN", title: "Retrait de transfert confirmé", message: `${transfer.agencyTo} a confirmé la remise du transfert provenant de ${transfer.agencyFrom}. ${details} — Agent ${actor.name}.` }
  ];
}

export async function notifyTransferCreated(value: unknown, actor: Actor) {
  const transfer = asTransferSummary(value);
  if (!transfer) return;
  await persist(buildTransferCreatedNotifications(transfer, actor), actor);
}

export async function notifyTransferWithdrawn(transfer: TransferSummary, actor: Actor) {
  await persist(buildTransferWithdrawnNotifications(transfer, actor), actor);
}

async function persist(notifications: readonly TransferNotification[], actor: Actor) {
  await Promise.all(notifications.map((notification) => recordInternalNotification({ ...notification, type: "TRANSFER", actorUserId: actor.userId, actorName: actor.name })));
}

function asTransferSummary(value: unknown): TransferSummary | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<TransferSummary>;
  return typeof row.transferId === "string" && Boolean(row.transferId) && typeof row.agencyFrom === "string" && typeof row.agencyTo === "string" ? row as TransferSummary : null;
}
