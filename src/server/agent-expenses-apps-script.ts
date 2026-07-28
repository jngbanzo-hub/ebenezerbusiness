import "server-only";

import type { AuthorizedAgentIdentity } from "@/server/agent-authorization";

const AGENT_EXPENSE_ACTIONS = [
  "ENREGISTRER_DEPENSE",
  "DEMANDER_CORRECTION"
] as const;

type AgentExpenseAction = (typeof AGENT_EXPENSE_ACTIONS)[number];

type AgentExpenseRequest = {
  action: AgentExpenseAction;
  donnees: Record<string, unknown>;
};

const ALLOWED_REQUEST_KEYS = new Set(["action", "donnees"]);
const ALLOWED_DATA_KEYS: Record<AgentExpenseAction, ReadonlySet<string>> = {
  ENREGISTRER_DEPENSE: new Set([
    "expenseRequestId",
    "categorie",
    "description",
    "montant",
    "devise",
    "modePaiement",
    "reference",
    "observation"
  ]),
  DEMANDER_CORRECTION: new Set([
    "expenseRequestId",
    "correctionRequestId",
    "motif",
    "valeursDemandees"
  ])
};
const ALLOWED_CORRECTION_VALUE_KEYS = new Set([
  "categorie",
  "description",
  "montant",
  "devise",
  "modePaiement",
  "reference",
  "observation"
]);

export class AgentExpenseRequestError extends Error {}

export async function forwardAgentExpenseRequest(
  identity: AuthorizedAgentIdentity,
  value: unknown
): Promise<unknown> {
  const request = validateAgentExpenseRequest(value);
  const { url, apiKey } = readExpensesAppsScriptConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        apiKey,
        action: request.action,
        acteur: {
          id: identity.userId,
          nom: identity.nom,
          role: identity.role,
          actif: true,
          agence: identity.agence
        },
        donnees: request.donnees
      }),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("Le service Dépenses a refusé la requête.");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("Réponse invalide du service Dépenses.");
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function validateAgentExpenseRequest(value: unknown): AgentExpenseRequest {
  if (!isRecord(value) || hasUnexpectedKeys(value, ALLOWED_REQUEST_KEYS)) {
    throw new AgentExpenseRequestError("Requête Dépenses invalide.");
  }

  const action = value.action;
  if (
    typeof action !== "string" ||
    !AGENT_EXPENSE_ACTIONS.includes(action as AgentExpenseAction)
  ) {
    throw new AgentExpenseRequestError("Action Dépenses non autorisée.");
  }

  const typedAction = action as AgentExpenseAction;
  const donnees = value.donnees;
  if (
    !isRecord(donnees) ||
    hasUnexpectedKeys(donnees, ALLOWED_DATA_KEYS[typedAction])
  ) {
    throw new AgentExpenseRequestError("Données Dépenses invalides.");
  }

  if (typedAction === "DEMANDER_CORRECTION") {
    const valeursDemandees = donnees.valeursDemandees;
    if (
      !isRecord(valeursDemandees) ||
      hasUnexpectedKeys(valeursDemandees, ALLOWED_CORRECTION_VALUE_KEYS)
    ) {
      throw new AgentExpenseRequestError(
        "Valeurs de correction invalides."
      );
    }
  }

  return { action: typedAction, donnees };
}

function readExpensesAppsScriptConfiguration() {
  const url = process.env.DEPENSES_PUBLIC_APPS_SCRIPT_URL?.trim();
  const apiKey = process.env.DEPENSES_PUBLIC_API_KEY;

  if (!url || !apiKey) {
    throw new Error("Configuration serveur Dépenses manquante.");
  }

  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "script.google.com" ||
    !parsedUrl.pathname.endsWith("/exec")
  ) {
    throw new Error("URL serveur Dépenses invalide.");
  }

  return { url: parsedUrl.toString(), apiKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasUnexpectedKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>
) {
  return Object.keys(value).some((key) => !allowedKeys.has(key));
}
