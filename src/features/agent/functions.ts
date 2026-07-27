import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import {
  DESTINATIONS,
  type DestinationCode,
  type PaymentMode,
  type PaymentResult
} from "@/features/agent/types";

const FUNCTION_NAMES = {
  search: "paiements-agents-rechercher-colis",
  payment: "paiements-agents-enregistrer-paiement"
} as const;

const ERROR_MESSAGES = {
  SESSION_EXPIREE: "Votre session Agent a expiré. Veuillez vous reconnecter.",
  COMPTE_DESACTIVE: "Votre accès Agent a été désactivé.",
  ACCES_REFUSE: "Accès Agent refusé.",
  COLIS_INTROUVABLE: "Aucun colis ne correspond à ce code pour la destination sélectionnée.",
  DESTINATION_INVALIDE: "Destination invalide. Choisissez Kinshasa, Lubumbashi ou Kolwezi.",
  AGENCE_INVALIDE: "Agence invalide.",
  MONTANT_INVALIDE: "Le montant payé est invalide.",
  MODE_PAIEMENT_INVALIDE: "Le mode de paiement est invalide.",
  PAYMENT_REQUEST_ID_INVALIDE:
    "La demande de paiement n’a pas pu être sécurisée. Veuillez réessayer.",
  PAIEMENT_DEJA_ENREGISTRE: "Ce paiement a déjà été enregistré.",
  DEPASSEMENT_SOLDE: "Le montant payé dépasse le solde restant.",
  COLIS_DEJA_SOLDE: "Ce colis est déjà entièrement soldé.",
  MONTANT_SUPERIEUR_SOLDE: "Le montant payé dépasse le solde restant.",
  PAIEMENT_PARTIEL_INTERDIT:
    "Le montant doit correspondre exactement au solde restant pour cette agence.",
  PAIEMENT_REFUSE: "Le paiement a été refusé. Vérifiez les informations et réessayez.",
  SERVICE_INDISPONIBLE: "Le service Agent est indisponible. Veuillez réessayer."
} as const;

export type AgentApiErrorCode = keyof typeof ERROR_MESSAGES;

export class AgentApiError extends Error {
  constructor(
    message: string,
    readonly code: AgentApiErrorCode | null
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readErrorCode(data: Record<string, unknown>): AgentApiErrorCode | null {
  const value = data.error ?? data.code;
  return typeof value === "string" && value in ERROR_MESSAGES
    ? (value as AgentApiErrorCode)
    : null;
}

function createResponseError(data: Record<string, unknown> | null, fallback: string) {
  if (data) {
    const code = readErrorCode(data);
    if (code) return new AgentApiError(ERROR_MESSAGES[code], code);
    if (typeof data.message === "string" && data.message.trim()) {
      return new AgentApiError(data.message.trim().slice(0, 300), null);
    }
  }

  return new AgentApiError(fallback, null);
}

async function invokeAgentFunction<T>(
  functionName: (typeof FUNCTION_NAMES)[keyof typeof FUNCTION_NAMES],
  payload: object
): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Votre session a expiré. Veuillez vous reconnecter.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Configuration Supabase manquante.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const rawData: unknown = await response.json().catch(() => null);
  const data = isRecord(rawData) ? rawData : null;

  if (!response.ok) {
    throw createResponseError(data, "La demande a échoué.");
  }

  if (!data) {
    throw new Error("Réponse vide du service.");
  }

  if (data.success === false) {
    throw createResponseError(data, "L’opération a été refusée.");
  }

  return data as T;
}

export function searchParcel(payload: { destinationCode: string; codeColis: string }) {
  return invokeAgentFunction<Record<string, unknown>>(FUNCTION_NAMES.search, payload);
}

export function savePayment(payload: {
  codeColis: string;
  destinationCode: string;
  montantPaye: number;
  modePaiement: PaymentMode;
  referencePaiement: string;
  observation: string;
  paymentRequestId: string;
}) {
  return invokeAgentFunction<Record<string, unknown>>(FUNCTION_NAMES.payment, payload).then(
    parsePaymentResult
  );
}

function parsePaymentResult(response: Record<string, unknown>): PaymentResult {
  if (
    typeof response.codeColis !== "string" ||
    !isDestinationCode(response.destinationCode) ||
    typeof response.destinationNom !== "string" ||
    !isNonNegativeNumber(response.montantPaye) ||
    !isNonNegativeNumber(response.nouveauTotalPaye) ||
    !isNonNegativeNumber(response.nouveauSolde) ||
    (response.statutPaiement !== "SOLDE" &&
      response.statutPaiement !== "PARTIELLEMENT PAYE") ||
    typeof response.datePaiement !== "string"
  ) {
    throw new AgentApiError("La confirmation du paiement est invalide.", null);
  }

  return {
    codeColis: response.codeColis.trim(),
    destinationCode: response.destinationCode,
    destinationNom: response.destinationNom.trim(),
    montantPaye: response.montantPaye,
    nouveauTotalPaye: response.nouveauTotalPaye,
    nouveauSolde: response.nouveauSolde,
    statutPaiement: response.statutPaiement,
    datePaiement: response.datePaiement
  };
}

function isDestinationCode(value: unknown): value is DestinationCode {
  return typeof value === "string" && DESTINATIONS.includes(value as DestinationCode);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
