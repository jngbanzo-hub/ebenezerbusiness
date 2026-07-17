import type {
  ManifestNotificationCandidate,
  NotificationTemplateName
} from "@/server/notifications/manifest-parser";

export type WhatsAppTemplatePayload = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: NotificationTemplateName;
    language: {
      code: "fr";
      policy: "deterministic";
    };
    components: Array<{
      type: "body";
      parameters: Array<{
        type: "text";
        text: string;
      }>;
    }>;
  };
};

export function buildWhatsAppTemplatePayload(
  candidate: ManifestNotificationCandidate
): WhatsAppTemplatePayload {
  const parameters = getTemplateParameters(candidate).map((text) => ({
    type: "text" as const,
    text
  }));

  return {
    messaging_product: "whatsapp",
    to: candidate.recipient.contact.whatsappNumber,
    type: "template",
    template: {
      name: candidate.event.templateName,
      language: {
        code: "fr",
        policy: "deterministic"
      },
      components: [
        {
          type: "body",
          parameters
        }
      ]
    }
  };
}

function getTemplateParameters(candidate: ManifestNotificationCandidate) {
  const { row, event, recipient } = candidate;
  const recipientName = recipient.contact.name;
  const senderName = row.expediteurRaw ? candidateSenderName(candidate) : "Non renseigné";

  if (event.templateName === "colis_livre") {
    return [senderName, row.codeColis, candidateBeneficiaryName(candidate), row.destination.toUpperCase()];
  }

  if (event.templateName === "colis_en_vol_expediteur") {
    return [senderName, candidateBeneficiaryName(candidate), row.codeColis, row.destination.toUpperCase()];
  }

  if (event.templateName === "colis_en_vol_beneficiaire") {
    return [candidateBeneficiaryName(candidate), senderName, row.codeColis, row.destination.toUpperCase()];
  }

  if (event.templateName === "colis_en_transit_expediteur") {
    return [senderName, candidateBeneficiaryName(candidate), row.codeColis, row.destination.toUpperCase()];
  }

  if (event.templateName === "colis_en_transit_beneficiaire") {
    return [candidateBeneficiaryName(candidate), senderName, row.codeColis, row.destination.toUpperCase()];
  }

  return [
    recipientName,
    row.codeColis,
    senderName,
    row.destination.toUpperCase(),
    row.poids,
    row.montant,
    event.dateConcerned
  ];
}

function candidateSenderName(candidate: ManifestNotificationCandidate) {
  return extractNameFromContactCell(candidate.row.expediteurRaw);
}

function candidateBeneficiaryName(candidate: ManifestNotificationCandidate) {
  return extractNameFromContactCell(candidate.row.beneficiaireRaw);
}

function extractNameFromContactCell(value: string) {
  const phoneMatch = value.match(/(?:\+?\d[\d\s()./-]{6,}\d)/);
  const name = value
    .replace(phoneMatch?.[0] ?? "", " ")
    .replace(/[()]/g, " ")
    .replace(/\s*[-/|:]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return name || "Non renseigné";
}
