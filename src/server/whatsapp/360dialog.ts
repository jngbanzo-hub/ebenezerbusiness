import { createHash } from "crypto";

import { z } from "zod";

import type { WhatsAppTemplatePayload } from "@/server/whatsapp/templates";

const whatsappEnvSchema = z.object({
  WHATSAPP_PROVIDER: z.enum(["360dialog", "green-api", "meta-cloud"]).default("360dialog"),
  DIALOG360_API_KEY: z.string().optional(),
  DIALOG360_BASE_URL: z.string().url().default("https://waba-v2.360dialog.io"),
  DIALOG360_COLIS_LIVRE_APPROVED: z.enum(["true", "false"]).default("false"),
  DIALOG360_EN_VOL_APPROVED: z.enum(["true", "false"]).default("false"),
  DIALOG360_EN_TRANSIT_APPROVED: z.enum(["true", "false"]).default("false"),
  NOTIFICATIONS_DRY_RUN: z.enum(["true", "false"]).default("true")
});

export type SendWhatsAppTemplateResult = {
  provider: "360dialog" | "green-api" | "meta-cloud" | "dry-run";
  dryRun: boolean;
  messageId?: string;
  status: "dry_run" | "sent" | "failed";
  error?: string;
};

type Dialog360MessagesResponse = {
  messages?: Array<{
    id?: string;
  }>;
  error?: {
    message?: string;
  };
};

export function getWhatsAppRuntimeConfig() {
  const parsed = whatsappEnvSchema.parse({
    WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER || "360dialog",
    DIALOG360_API_KEY: process.env.DIALOG360_API_KEY || undefined,
    DIALOG360_BASE_URL: process.env.DIALOG360_BASE_URL || "https://waba-v2.360dialog.io",
    DIALOG360_COLIS_LIVRE_APPROVED: process.env.DIALOG360_COLIS_LIVRE_APPROVED || "false",
    DIALOG360_EN_VOL_APPROVED: process.env.DIALOG360_EN_VOL_APPROVED || "false",
    DIALOG360_EN_TRANSIT_APPROVED: process.env.DIALOG360_EN_TRANSIT_APPROVED || "false",
    NOTIFICATIONS_DRY_RUN: process.env.NOTIFICATIONS_DRY_RUN || "true"
  });

  return {
    provider: parsed.WHATSAPP_PROVIDER,
    dialog360ApiKey: parsed.DIALOG360_API_KEY,
    dialog360BaseUrl: parsed.DIALOG360_BASE_URL.replace(/\/$/, ""),
    colisLivreApproved: parsed.DIALOG360_COLIS_LIVRE_APPROVED === "true",
    enVolApproved: parsed.DIALOG360_EN_VOL_APPROVED === "true",
    enTransitApproved: parsed.DIALOG360_EN_TRANSIT_APPROVED === "true",
    dryRun: parsed.NOTIFICATIONS_DRY_RUN !== "false"
  };
}

export async function sendWhatsAppTemplate(
  payload: WhatsAppTemplatePayload
): Promise<SendWhatsAppTemplateResult> {
  const config = getWhatsAppRuntimeConfig();

  if (config.dryRun) {
    return {
      provider: "dry-run",
      dryRun: true,
      messageId: createDryRunMessageId(payload),
      status: "dry_run"
    };
  }

  if (config.provider !== "360dialog") {
    return {
      provider: config.provider,
      dryRun: false,
      status: "failed",
      error: `Fournisseur WhatsApp non activé localement: ${config.provider}.`
    };
  }

  if (payload.template.name === "colis_livre" && !config.colisLivreApproved) {
    return {
      provider: "360dialog",
      dryRun: false,
      status: "failed",
      error: "Le modèle colis_livre est en attente d'approbation 360dialog."
    };
  }

  if (
    (payload.template.name === "colis_en_vol_expediteur" ||
      payload.template.name === "colis_en_vol_beneficiaire") &&
    !config.enVolApproved
  ) {
    return {
      provider: "360dialog",
      dryRun: false,
      status: "failed",
      error: "Les modèles En Vol sont en attente d'approbation 360dialog."
    };
  }

  if (
    (payload.template.name === "colis_en_transit_expediteur" ||
      payload.template.name === "colis_en_transit_beneficiaire") &&
    !config.enTransitApproved
  ) {
    return {
      provider: "360dialog",
      dryRun: false,
      status: "failed",
      error: "Les modèles En Transit sont en attente d'approbation 360dialog."
    };
  }

  if (!config.dialog360ApiKey) {
    return {
      provider: "360dialog",
      dryRun: false,
      status: "failed",
      error: "DIALOG360_API_KEY manquant."
    };
  }

  const response = await fetch(`${config.dialog360BaseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "D360-API-KEY": config.dialog360ApiKey
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  const body = (await response.json().catch(() => ({}))) as Dialog360MessagesResponse;

  if (!response.ok) {
    return {
      provider: "360dialog",
      dryRun: false,
      status: "failed",
      error: body.error?.message ?? "Envoi 360dialog impossible."
    };
  }

  return {
    provider: "360dialog",
    dryRun: false,
    messageId: body.messages?.[0]?.id,
    status: "sent"
  };
}

function createDryRunMessageId(payload: WhatsAppTemplatePayload) {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 20);

  return `dryrun_${hash}`;
}
