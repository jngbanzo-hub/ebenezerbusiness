import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import {
  AdminExpenseReadError,
  readAdminExpenses,
  type AdminExpenseFilters
} from "@/server/agent-expenses-apps-script";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedQueryKeys = new Set([
  "from", "to", "agency", "category", "currency", "agent",
  "status", "reference", "page", "pageSize"
]);

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) {
      return error(
        authorization.status,
        authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        "Accès Admin refusé."
      );
    }

    const url = new URL(request.url);
    if (Array.from(url.searchParams.keys()).some((key) => !allowedQueryKeys.has(key))) {
      return error(400, "INVALID_FILTERS", "Filtres invalides.");
    }

    const filters: AdminExpenseFilters = {
      dateDebut: optional(url.searchParams.get("from")),
      dateFin: optional(url.searchParams.get("to")),
      agence: optional(url.searchParams.get("agency")) as AdminExpenseFilters["agence"],
      categorie: optional(url.searchParams.get("category")),
      devise: optional(url.searchParams.get("currency")) as AdminExpenseFilters["devise"],
      agent: optional(url.searchParams.get("agent")),
      statut: optional(url.searchParams.get("status")) as AdminExpenseFilters["statut"],
      reference: optional(url.searchParams.get("reference")),
      page: positiveInteger(url.searchParams.get("page"), 1),
      pageSize: positiveInteger(url.searchParams.get("pageSize"), 50)
    };

    const result = await readAdminExpenses(
      {
        userId: authorization.userId,
        email: authorization.email,
        agency: authorization.agency
      },
      filters
    );
    return NextResponse.json(result, { headers: noStoreHeaders() });
  } catch (caught) {
    if (caught instanceof AdminExpenseReadError && caught.code === "CATEGORIE_INVALIDE") {
      return error(400, "INVALID_CATEGORY", "Catégorie invalide ou non reconnue.");
    }
    if (caught instanceof ZodError || caught instanceof InvalidNumberError) {
      return error(400, "INVALID_FILTERS", "Filtres invalides.");
    }
    return error(503, "EXPENSES_UNAVAILABLE", "Lecture des dépenses indisponible.");
  }
}

function optional(value: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function positiveInteger(value: string | null, fallback: number) {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new InvalidNumberError();
  return Number(value);
}

class InvalidNumberError extends Error {}

function error(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: noStoreHeaders() }
  );
}

function noStoreHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0" };
}
