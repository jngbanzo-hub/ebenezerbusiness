import { authorizeAgentRequest } from "@/server/agent-authorization";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { readAdminExpenses, type AdminExpenseListResponse } from "@/server/agent-expenses-apps-script";
import { buildCooReport } from "@/server/coo-report";
import { businessDatePortoNovo } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const allowedQueryKeys = new Set(["from", "to", "code", "label"]);

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAgentRequest(request);
    if (!authorization.authorized) return fail(authorization.status, "Accès refusé.");
    if (authorization.identity.site !== "COO") return fail(403, "Le Rapport COO est réservé aux Agents COO.");

    const url = new URL(request.url);
    if (Array.from(url.searchParams.keys()).some((key) => !allowedQueryKeys.has(key))) {
      return fail(400, "Filtres invalides.");
    }
    const today = businessDatePortoNovo();
    const from = readDate(url.searchParams.get("from"), today);
    const to = readDate(url.searchParams.get("to"), today);
    if (from > to) return fail(400, "Période invalide.");
    const code = readText(url.searchParams.get("code"), 64);
    const label = readText(url.searchParams.get("label"), 200);
    const actor = {
      userId: authorization.identity.userId,
      email: authorization.identity.email,
      agency: "COO" as const
    };
    const [payments, expenses] = await Promise.all([
      readAdminPayments(),
      readAllExpenses(actor, from, to)
    ]);
    return Response.json(buildCooReport({ from, to, code, label, payments, expenses }), {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    if (error instanceof CooReportRequestError) return fail(400, error.message);
    return fail(503, "Le Rapport COO est temporairement indisponible.");
  }
}

async function readAllExpenses(actor: { userId: string; email: string; agency: "COO" }, from: string, to: string) {
  const first = await readAdminExpenses(actor, { dateDebut: from, dateFin: to, agence: "COO", page: 1, pageSize: 100 });
  if (first.pagination.totalPages <= 1) return first.depenses;
  const rest = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
    readAdminExpenses(actor, { dateDebut: from, dateFin: to, agence: "COO", page: index + 2, pageSize: 100 })
  ));
  return [...first.depenses, ...rest.flatMap((page: AdminExpenseListResponse) => page.depenses)];
}

function readDate(value: string | null, fallback: string) {
  if (!value) return fallback;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new CooReportRequestError("Date invalide.");
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.toISOString().slice(0, 10) !== value) throw new CooReportRequestError("Date invalide.");
  return value;
}

function readText(value: string | null, maxLength: number) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (normalized.length > maxLength) throw new CooReportRequestError("Filtre invalide.");
  return normalized || undefined;
}

function fail(status: number, message: string) {
  return Response.json({ message }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

class CooReportRequestError extends Error {}
