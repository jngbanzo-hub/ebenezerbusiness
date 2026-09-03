import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type JsonObject = Readonly<Record<string, unknown>>;

export type ExpensePerformanceTelemetry = Readonly<{
  requestId: string;
  agency: string;
  result: "SUCCESS" | "ERROR";
  serverStartedAt: string;
  serverFinishedAt: string;
  serverDurationsMs: JsonObject;
  appsScript?: JsonObject | null;
  telemetryCostMs?: number;
}>;

export async function persistExpensePerformanceTelemetry(input: ExpensePerformanceTelemetry) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return false;

  const agency = safeAgency(input.agency);
  if (!agency) return false;
  const apps = input.appsScript ?? {};
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch }
  });
  const { error } = await client.from("expense_performance_events").upsert({
    request_hash: hashRequestId(input.requestId),
    agency,
    result: input.result,
    server_started_at: input.serverStartedAt,
    server_finished_at: input.serverFinishedAt,
    server_durations_ms: numericRecord(input.serverDurationsMs),
    apps_script_started_at: isoOrNull(apps.startedAt),
    apps_script_finished_at: isoOrNull(apps.finishedAt),
    apps_script_total_ms: finiteOrNull(apps.totalMs),
    apps_script_steps_ms: numericRecord(recordOrEmpty(apps.stepsMs)),
    statistics_path: apps.statisticsPath === "INCREMENTAL" || apps.statisticsPath === "FULL_FALLBACK" ? apps.statisticsPath : null,
    fallback_reason: safeTechnicalLabel(apps.fallbackReason),
    sheet_calls: numericRecord(recordOrEmpty(apps.sheetCalls)),
    telemetry_cost_ms: finiteOrNull(input.telemetryCostMs)
  }, { onConflict: "request_hash" });
  return !error;
}

export async function persistExpenseFrontendTelemetry(input: Readonly<{
  requestId: string;
  agency: string;
  metrics: JsonObject;
}>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return false;
  const agency = safeAgency(input.agency);
  if (!agency) return false;
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: noStoreFetch } });
  const { error } = await client.from("expense_performance_events")
    .update({ frontend_durations_ms: numericRecord(input.metrics) })
    .eq("request_hash", hashRequestId(input.requestId))
    .eq("agency", agency);
  return !error;
}

function hashRequestId(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
function safeAgency(value: string) { return ["COO", "FIH", "LSHI", "KLZ"].includes(value) ? value : null; }
function recordOrEmpty(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numericRecord(value: JsonObject) { return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "number" && Number.isFinite(item)).map(([key, item]) => [key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64), Math.round((item as number) * 10) / 10])); }
function finiteOrNull(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : null; }
function isoOrNull(value: unknown) { if (typeof value !== "string") return null; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function safeTechnicalLabel(value: unknown) { return typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value) ? value : null; }
async function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 250);
  try {
    return await fetch(input, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
