import "server-only";

import { createClient } from "@supabase/supabase-js";

import { OpeningBalanceDuplicateError, type CashAccountRecord, type CashAgency, type NewOpeningBalanceRecord, type OpeningBalanceRecord, type OpeningBalanceRepository } from "@/app/api/admin/cash/opening-balance/opening-balance-command";

export class CashServiceConfigurationError extends Error {}

export function createServerOpeningBalanceRepository(): OpeningBalanceRepository {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new CashServiceConfigurationError("Configuration Caisse serveur manquante.");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const eventColumns = "event_id,cash_account_id,agency,amount,business_date,source_request_id,actor_user_id,metadata";
  return {
    async findAccount(agency) {
      const { data, error } = await client.schema("public").from("cash_accounts").select("id,agency,currency,status,version").eq("agency", agency).maybeSingle();
      if (error) throw new Error("CASH_ACCOUNT_READ_FAILED");
      return data ? data as CashAccountRecord : null;
    },
    async findByRequestId(requestId) {
      const { data, error } = await client.schema("public").from("cash_events").select(eventColumns).eq("source_type", "ADMIN_OPENING_BALANCE").eq("source_request_id", requestId).maybeSingle();
      if (error) throw new Error("CASH_EVENT_READ_FAILED");
      return data ? decodeRecord(data as Record<string, unknown>) : null;
    },
    async findByAccountId(accountId) {
      const { data, error } = await client.schema("public").from("cash_events").select(eventColumns).eq("cash_account_id", accountId).eq("event_type", "OPENING_BALANCE_RECORDED").maybeSingle();
      if (error) throw new Error("CASH_EVENT_READ_FAILED");
      return data ? decodeRecord(data as Record<string, unknown>) : null;
    },
    async insertOpeningBalance(record) {
      const { error } = await client.schema("public").from("cash_events").insert({ event_id: record.eventId, cash_account_id: record.accountId, agency: record.agency, business_date: record.businessDate, occurred_at: record.occurredAt, event_type: "OPENING_BALANCE_RECORDED", direction: "CREDIT", amount: record.amount, currency: "USD", source_type: "ADMIN_OPENING_BALANCE", source_id: `opening-balance:${record.accountId}`, source_request_id: record.requestId, actor_user_id: record.actorUserId, actor_name_snapshot: record.actorName, corrected_event_id: null, reason: null, version_before: 0, version_after: 1, metadata: { commandFingerprint: record.fingerprint, observation: record.observation } });
      if (error?.code === "23505") throw new OpeningBalanceDuplicateError();
      if (error) throw new Error("CASH_EVENT_INSERT_FAILED");
    },
    async activateAccount(accountId) {
      const { data, error } = await client.schema("public").from("cash_accounts").update({ status: "ACTIVE" }).eq("id", accountId).eq("status", "SUSPENDED").select("status").maybeSingle();
      if (error) return "FAILED";
      if (data?.status === "ACTIVE") return "ACTIVATED";
      const { data: current, error: readError } = await client.schema("public").from("cash_accounts").select("status").eq("id", accountId).maybeSingle();
      return !readError && current?.status === "ACTIVE" ? "ALREADY_ACTIVE" : "FAILED";
    },
  };
}

function decodeRecord(row: Record<string, unknown>): OpeningBalanceRecord {
  const metadata = row.metadata as Record<string, unknown> | null;
  if (typeof row.event_id !== "string" || typeof row.cash_account_id !== "string" || !["FIH", "LSHI", "KLZ"].includes(String(row.agency)) || typeof row.amount !== "number" || typeof row.business_date !== "string" || typeof row.source_request_id !== "string" || typeof row.actor_user_id !== "string" || typeof metadata?.commandFingerprint !== "string") throw new Error("CASH_EVENT_INVALID");
  return { eventId: row.event_id, accountId: row.cash_account_id, agency: row.agency as CashAgency, amount: row.amount, businessDate: row.business_date, requestId: row.source_request_id, actorUserId: row.actor_user_id, fingerprint: metadata.commandFingerprint };
}
