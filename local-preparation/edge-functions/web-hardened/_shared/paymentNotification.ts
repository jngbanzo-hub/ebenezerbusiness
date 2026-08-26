export type ConfirmedPaymentNotification = Readonly<{
  actorName: string;
  actorUserId: string;
  agency: string;
  codeColis: string;
  montantPaye: number;
  paymentRequestId: string;
}>;

type NotificationWriter = {
  schema: (name: "public") => {
    from: (table: "internal_notifications") => {
      upsert: (
        value: Record<string, unknown>,
        options: { ignoreDuplicates: true; onConflict: "event_key" },
      ) => PromiseLike<{ error: unknown }>;
    };
  };
};

export function paymentNotificationEventKey(paymentRequestId: string) {
  return `PAYMENT:${paymentRequestId}`;
}

export function buildConfirmedPaymentNotification(
  input: ConfirmedPaymentNotification,
) {
  return {
    actor_name: input.actorName.slice(0, 160),
    actor_user_id: input.actorUserId,
    agency: input.agency,
    audience_role: "ALL",
    event_key: paymentNotificationEventKey(input.paymentRequestId),
    message: `${input.codeColis} — ${input.montantPaye.toFixed(2)} USD — ${input.actorName}`.slice(0, 500),
    title: input.agency === "COO"
      ? "Recette COO hors caisse enregistrée"
      : "Paiement enregistré",
    type: "PAYMENT",
  } as const;
}

export async function recordConfirmedPaymentNotification(
  writer: NotificationWriter | null,
  input: ConfirmedPaymentNotification,
) {
  if (!writer) return false;

  try {
    const { error } = await writer
      .schema("public")
      .from("internal_notifications")
      .upsert(buildConfirmedPaymentNotification(input), {
        ignoreDuplicates: true,
        onConflict: "event_key",
      });
    return error === null;
  } catch {
    return false;
  }
}
