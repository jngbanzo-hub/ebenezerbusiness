import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { authenticatedRead } from "@/features/auth/authenticated-fetch";

import type { BilanPayload, UnresolvedCohort } from "./bilan-ui";

export async function loadAdminBilan(accessToken: string, query: string, signal?: AbortSignal): Promise<BilanPayload | UnresolvedCohort> {
  const response = await authenticatedRead(getSupabaseBrowserClient().auth, `/api/admin/bilan?${query}`, { signal }, fetch, accessToken);
  const payload = await response.json().catch(() => null) as (BilanPayload | UnresolvedCohort | { error?: { message?: string }; message?: string }) | null;
  if (!response.ok) {
    const message = payload && "error" in payload ? payload.error?.message : payload && "message" in payload ? payload.message : undefined;
    throw new Error(message || "Source BILAN temporairement indisponible.");
  }
  if (!payload || (!("meta" in payload))) throw new Error("Réponse BILAN invalide.");
  return payload as BilanPayload | UnresolvedCohort;
}
