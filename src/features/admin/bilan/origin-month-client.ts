import { authenticatedRead } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { validateCohortDefinitions, type OriginMonth } from "./cohort-catalog";

export async function loadOriginMonths(token: string): Promise<readonly OriginMonth[]> {
  const response = await authenticatedRead(getSupabaseBrowserClient().auth, "/api/admin/bilan/origin-months", { cache: "no-store" }, fetch, token);
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload?.months)) throw new Error("Registre des mois temporairement indisponible.");
  validateCohortDefinitions(payload.months);
  if (payload.months.some((row: OriginMonth) => typeof row.registryId !== "string" || typeof row.active !== "boolean")) throw new Error("Registre invalide.");
  return payload.months;
}
