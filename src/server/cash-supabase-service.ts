import "server-only";

import { createClient } from "@supabase/supabase-js";

import { OpeningBalanceError, type OpeningBalanceRepository, type OpeningBalanceResult } from "@/app/api/admin/cash/opening-balance/opening-balance-command";

export class CashServiceConfigurationError extends Error {}

export function createServerOpeningBalanceRepository(): OpeningBalanceRepository {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new CashServiceConfigurationError("Configuration Caisse serveur manquante.");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return {
    async openCashAccount(command) {
      const { data, error } = await client.schema("public").rpc("open_cash_account", {
        p_agency: command.agency,
        p_amount: command.amount,
        p_business_date: command.businessDate,
        p_observation: command.observation,
        p_request_id: command.requestId,
        p_actor_id: command.actorUserId,
      });
      if (error) throw mapOpeningError(error.message);
      return decodeResult(data);
    },
  };
}

function mapOpeningError(message: string) {
  const codes = ["IDEMPOTENCY_CONFLICT", "SECOND_OPENING_NOT_ALLOWED", "ACCOUNT_NOT_READY", "ADMIN_REQUIRED", "INVALID_OPENING_BALANCE"] as const;
  const code = codes.find((candidate) => message.includes(candidate));
  if (code === "IDEMPOTENCY_CONFLICT") return new OpeningBalanceError(code, "Ce requestId est déjà associé à une autre commande.");
  if (code === "SECOND_OPENING_NOT_ALLOWED") return new OpeningBalanceError(code, "Le solde initial de cette agence est déjà défini.");
  if (code === "ACCOUNT_NOT_READY") return new OpeningBalanceError(code, "Le compte de caisse n’est pas disponible pour son solde initial.");
  if (code === "ADMIN_REQUIRED" || code === "INVALID_OPENING_BALANCE") return new OpeningBalanceError("INVALID_COMMAND", "Commande de solde initial invalide.");
  return new OpeningBalanceError("SERVICE_UNAVAILABLE", "Ouverture atomique de la caisse indisponible.");
}

function decodeResult(value: unknown): OpeningBalanceResult {
  if (!value || typeof value !== "object") throw new Error("CASH_OPENING_RESULT_INVALID");
  const row = value as Record<string, unknown>;
  if (row.state !== "SUCCESS" || typeof row.replayed !== "boolean" || typeof row.eventId !== "string" || !["FIH", "LSHI", "KLZ"].includes(String(row.agency)) || typeof row.amount !== "number" || row.currency !== "USD" || typeof row.businessDate !== "string" || row.accountStatus !== "ACTIVE") throw new Error("CASH_OPENING_RESULT_INVALID");
  return Object.freeze(row as OpeningBalanceResult);
}
