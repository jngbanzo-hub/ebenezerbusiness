import { createHash } from "crypto";

import type { PublicManifestRow } from "@/server/google-sheets";

export const notificationTemplateNames = [
  "coli_depose",
  "colis_en_vol_expediteur",
  "colis_en_vol_beneficiaire",
  "colis_en_transit_expediteur",
  "colis_en_transit_beneficiaire",
  "colis_arrive",
  "colis_livre"
] as const;
export const activeNotificationTemplateNames = notificationTemplateNames;

export type NotificationTemplateName = (typeof notificationTemplateNames)[number];
export type NotificationRecipientRole = "expediteur" | "beneficiaire";

export type ManifestContact = {
  name: string;
  rawPhone: string;
  whatsappNumber: string;
  isValid: boolean;
  error?: string;
};

export type ManifestNotificationEvent = {
  templateName: NotificationTemplateName;
  dateConcerned: string;
  triggerStatus: string;
};

export type ManifestRecipient = {
  role: NotificationRecipientRole;
  contact: ManifestContact;
};

export type ManifestNotificationCandidate = {
  row: PublicManifestRow;
  event: ManifestNotificationEvent;
  recipient: ManifestRecipient;
  dedupKey: string;
};

export const manifestNotificationStatuses = {
  deposited: "⚪ En Attente",
  inFlight: "✈️ En Vol",
  inTransit: "🚚 En Transit",
  arrived: "🏢 Arrivé",
  delivered: "✅ Livré"
} as const;

export function buildNotificationCandidates(row: PublicManifestRow) {
  const events = detectNotificationEvents(row);

  return events.flatMap((event) => buildNotificationCandidatesForEvent(row, event));
}

export function buildNotificationCandidatesForEvent(
  row: PublicManifestRow,
  event: ManifestNotificationEvent | null
) {
  if (!event || !row.codeColis) {
    return [];
  }

  const recipients = getRecipientsForTemplate(row, event.templateName);

  return recipients.map((recipient) => ({
    row,
    event,
    recipient,
    dedupKey: createNotificationDedupKey(row, event.templateName, recipient)
  }));
}

export function buildRecipients(row: PublicManifestRow): ManifestRecipient[] {
  return [
    buildSenderRecipient(row),
    {
      role: "beneficiaire",
      contact: parseManifestContact(row.beneficiaireRaw, "beneficiaire")
    }
  ];
}

export function detectNotificationEvent(row: PublicManifestRow): ManifestNotificationEvent | null {
  return detectNotificationEvents(row)[0] ?? null;
}

export function detectNotificationEvents(row: PublicManifestRow): ManifestNotificationEvent[] {
  const status = normalizeManifestStatusSpacing(row.statut);

  if (status === manifestNotificationStatuses.deposited) {
    return [
      {
        templateName: "coli_depose",
        dateConcerned: row.dateDepot,
        triggerStatus: status
      }
    ];
  }

  if (status === manifestNotificationStatuses.inFlight) {
    return [
      {
        templateName: "colis_en_vol_expediteur",
        dateConcerned: "",
        triggerStatus: status
      },
      {
        templateName: "colis_en_vol_beneficiaire",
        dateConcerned: "",
        triggerStatus: status
      }
    ];
  }

  if (status === manifestNotificationStatuses.inTransit) {
    return [
      {
        templateName: "colis_en_transit_expediteur",
        dateConcerned: "",
        triggerStatus: status
      },
      {
        templateName: "colis_en_transit_beneficiaire",
        dateConcerned: "",
        triggerStatus: status
      }
    ];
  }

  if (status === manifestNotificationStatuses.arrived) {
    return [
      {
        templateName: "colis_arrive",
        dateConcerned: "",
        triggerStatus: status
      }
    ];
  }

  if (status === manifestNotificationStatuses.delivered) {
    return [
      {
        templateName: "colis_livre",
        dateConcerned: "",
        triggerStatus: status
      }
    ];
  }

  return [];
}

function getRecipientsForTemplate(row: PublicManifestRow, templateName: NotificationTemplateName) {
  if (
    templateName === "colis_livre" ||
    templateName === "colis_en_vol_expediteur" ||
    templateName === "colis_en_transit_expediteur"
  ) {
    return [buildSenderRecipient(row)];
  }

  if (
    templateName === "colis_en_vol_beneficiaire" ||
    templateName === "colis_en_transit_beneficiaire"
  ) {
    return [
      {
        role: "beneficiaire" as const,
        contact: parseManifestContact(row.beneficiaireRaw, "beneficiaire")
      }
    ];
  }

  return buildRecipients(row);
}

export function normalizeManifestStatusSpacing(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function parseManifestContact(
  value: string,
  role: NotificationRecipientRole
): ManifestContact {
  const rawValue = value.trim();
  const phoneMatch = findPhoneMatch(rawValue);
  const rawPhone = phoneMatch?.[0]?.trim() ?? "";
  const name = cleanContactName(rawValue, rawPhone);
  const whatsappNumber = normalizePhoneForWhatsApp(rawPhone, role);

  if (!name) {
    return {
      name: "Non renseigné",
      rawPhone,
      whatsappNumber,
      isValid: false,
      error: "Nom absent ou illisible."
    };
  }

  if (!isValidWhatsAppNumber(whatsappNumber)) {
    return {
      name,
      rawPhone,
      whatsappNumber,
      isValid: false,
      error: "Numéro WhatsApp absent ou invalide."
    };
  }

  return {
    name,
    rawPhone,
    whatsappNumber,
    isValid: true
  };
}

export function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length <= 5) {
    return "***";
  }

  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

function createNotificationDedupKey(
  row: PublicManifestRow,
  templateName: NotificationTemplateName,
  recipient: ManifestRecipient
) {
  const rawKey = [
    row.sheetName,
    row.codeColis.trim().toUpperCase(),
    templateName,
    recipient.role,
    recipient.contact.whatsappNumber || "invalid"
  ].join("|");

  return createHash("sha256").update(rawKey).digest("hex");
}

function buildSenderRecipient(row: PublicManifestRow): ManifestRecipient {
  return {
    role: "expediteur",
    contact: parseManifestContact(row.expediteurRaw, "expediteur")
  };
}

function findPhoneMatch(value: string) {
  return value.match(/(?:\+?\d[\d\s()./-]{6,}\d)/);
}

function cleanContactName(value: string, rawPhone: string) {
  const withoutPhone = rawPhone ? value.replace(rawPhone, " ") : value;

  return withoutPhone
    .replace(/[()]/g, " ")
    .replace(/\s*[-/|:]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhoneForWhatsApp(rawPhone: string, role: NotificationRecipientRole) {
  const trimmedPhone = rawPhone.trim();
  const startsWithPlus = trimmedPhone.startsWith("+");
  const digits = trimmedPhone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (role === "expediteur" && !startsWithPlus) {
    return `229${digits}`;
  }

  return digits;
}

function isValidWhatsAppNumber(value: string) {
  return /^\d{8,15}$/.test(value);
}
