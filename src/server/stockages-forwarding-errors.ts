export const FORWARDING_AGENT_MESSAGES = Object.freeze({
  ACCESS_DENIED: "Accès Agent refusé.",
  ACTIVE_AGENT_REQUIRED: "Un compte Agent actif est requis.",
  CASH_ACCOUNT_SUSPENDED: "Caisse de l’agence non ouverte.",
  CASH_ACCOUNT_NOT_ACTIVE: "Caisse de l’agence non ouverte.",
  INITIAL_BALANCE_REQUIRED: "Solde initial de la Caisse requis.",
  STORAGE_ACCOUNT_SUSPENDED: "Stockage de l’agence non ouvert.",
  STORAGE_ACCOUNT_NOT_ACTIVE: "Stockage de l’agence non ouvert.",
  INITIAL_STOCK_REQUIRED: "Solde initial du Stockage requis.",
  INVALID_INTER_AGENCY_ROUTE: "Ce trajet inter-agences n’est pas autorisé.",
  STORAGE_AGENCY_NOT_SUPPORTED: "L’agence concernée n’est pas prise en charge par le Stockage.",
  INVALID_TRACKING_CODE: "Le format du code colis est invalide.",
  FORWARDING_ROUTE_NOT_ALLOWED: "Ce trajet inter-agences n’est pas autorisé.",
  SOURCE_PARCEL_NOT_ELIGIBLE: "Ce colis ne peut pas être acheminé dans son état actuel.",
  PARCEL_ALREADY_DELIVERED: "Ce colis est déjà livré.",
  PAYMENT_ALREADY_RECORDED: "Ce paiement a déjà été enregistré.",
  FORWARDING_ALREADY_EXISTS: "Un acheminement actif existe déjà pour ce colis.",
  IDEMPOTENCY_CONFLICT: "Cette demande correspond déjà à une autre opération.",
  NETWORK_RESULT_UNKNOWN: "Résultat en cours de vérification. Ne recommencez pas avec une nouvelle demande.",
  TRACKING_CODE_NOT_FOUND: "Aucun colis correspondant n’a été trouvé dans l’agence d’origine.",
  SOURCE_AGENCY_MISMATCH: "Le colis existe, mais pas dans l’agence source sélectionnée.",
  PARCEL_WEIGHT_UNAVAILABLE: "Le poids canonique du colis est indisponible.",
  PARCEL_WEIGHT_AMBIGUOUS: "Le poids canonique du colis doit être vérifié.",
  INVALID_FORWARDING_COMMAND: "La demande d’acheminement est invalide.",
  AGENT_SERVICE_UNAVAILABLE: "Le service Agent est indisponible. Veuillez réessayer.",
  FORWARDING_SERVICE_UNAVAILABLE: "Le service d’acheminement est indisponible. Veuillez réessayer."
} as const);

export function forwardingAgentMessage(code: string) {
  return FORWARDING_AGENT_MESSAGES[code as keyof typeof FORWARDING_AGENT_MESSAGES]
    ?? "L’acheminement inter-agences a été refusé.";
}
