import "server-only";

import { z } from "zod";

import type { AuthorizedAgentIdentity } from "@/server/agent-authorization";
import {
  attachConfirmedExpenseDebit,
  CashExpenseDebitError
} from "@/server/cash-expense-debit";

const AGENT_EXPENSE_ACTIONS = [
  "ENREGISTRER_DEPENSE",
  "DEMANDER_CORRECTION"
] as const;

const adminExpenseFiltersSchema = z.object({
  dateDebut: z.string().date().optional(),
  dateFin: z.string().date().optional(),
  agence: z.enum(["COO", "FIH", "LSHI", "KLZ"]).optional(),
  categorie: z.string().trim().min(1).max(200).optional(),
  devise: z.enum(["USD", "FCFA", "CDF"]).optional(),
  agent: z.string().trim().max(200).optional(),
  statut: z.enum(["ACTIVE", "CORRECTION_DEMANDEE", "CORRIGEE", "ANNULEE"]).optional(),
  reference: z.string().trim().max(200).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(50)
}).refine(
  (filters) => !filters.dateDebut || !filters.dateFin || filters.dateDebut <= filters.dateFin,
  "Période invalide."
);

const adminExpenseSchema = z.object({
  id: z.string().uuid(),
  expenseRequestId: z.string().uuid(),
  date: z.string().date(),
  dateHeure: z.string().datetime({ offset: true }),
  agence: z.enum(["COO", "FIH", "LSHI", "KLZ"]),
  categorie: z.string(),
  montant: z.number().positive(),
  devise: z.enum(["USD", "FCFA", "CDF"]),
  description: z.string(),
  observation: z.string(),
  agent: z.string(),
  statut: z.enum(["ACTIVE", "CORRECTION_DEMANDEE", "CORRIGEE", "ANNULEE"]),
  reference: z.string(),
  dateCreation: z.string().datetime({ offset: true }),
  dateMiseAJour: z.string().datetime({ offset: true }),
  annulee: z.boolean(),
  corrigee: z.boolean()
});

const currencyTotalsSchema = z.record(z.number().nonnegative());
const groupedTotalsSchema = z.record(currencyTotalsSchema);
const adminExpenseResponseSchema = z.object({
  success: z.literal(true),
  code: z.literal("DEPENSES_ADMIN_LISTEES"),
  lectureSeule: z.literal(true),
  depenses: z.array(adminExpenseSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative()
  }),
  totaux: z.object({
    nombreDepenses: z.number().int().nonnegative(),
    parDevise: currencyTotalsSchema,
    parAgence: groupedTotalsSchema,
    parCategorie: groupedTotalsSchema
  })
});

export type AdminExpenseFilters = z.input<typeof adminExpenseFiltersSchema>;
export type AdminExpenseListResponse = z.infer<typeof adminExpenseResponseSchema>;

type AdminExpenseIdentity = Readonly<{
  userId: string;
  email: string;
  agency: "COO" | "FIH" | "LSHI" | "KLZ" | null;
}>;

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

export class AgentExpenseRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "AgentExpenseRequestError";
  }
}

export async function readAdminExpenses(
  identity: AdminExpenseIdentity,
  value: AdminExpenseFilters,
  fetchImpl: typeof fetch = fetch
): Promise<AdminExpenseListResponse> {
  const filters = adminExpenseFiltersSchema.parse(value);
  const { url, apiKey } = readExpensesAppsScriptConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        action: "LISTER_DEPENSES_ADMIN",
        acteur: {
          id: identity.userId,
          nom: identity.email,
          role: "ADMIN",
          actif: true,
          agence: identity.agency ?? ""
        },
        donnees: filters
      }),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("Le service Dépenses a refusé la lecture Admin.");
    }
    const payload: unknown = await response.json();
    const parsed = adminExpenseResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse Admin Dépenses invalide.");
    }
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

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

    const result: unknown = await response.json();
    try {
      return await attachConfirmedExpenseDebit(identity, request, result);
    } catch (error) {
      if (error instanceof CashExpenseDebitError) {
        throw new AgentExpenseRequestError(
          error.code === "IDEMPOTENCY_CONFLICT"
            ? "Identifiant de dépense déjà utilisé avec un contenu différent."
            : "Le service Caisse est temporairement indisponible.",
          error.status
        );
      }
      throw error;
    }
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
