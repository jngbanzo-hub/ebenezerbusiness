import type { User } from "@supabase/supabase-js";

import { isAgency } from "@/features/agent/agencies";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { AgentProfile } from "@/features/agent/types";

export async function getAgentProfile(user: User): Promise<AgentProfile> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id, nom, agence, role, actif")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de vérifier le profil agent.");
  }

  if (!data) {
    throw new Error("Aucun profil agent n’est associé à ce compte.");
  }

  if (data.actif !== true) {
    throw new Error("Ce compte agent est inactif.");
  }

  if (!isAgency(data.agence)) {
    throw new Error("L’agence associée à ce profil est invalide.");
  }

  if (
    typeof data.id !== "string" ||
    typeof data.nom !== "string" ||
    !data.nom.trim() ||
    typeof data.role !== "string"
  ) {
    throw new Error("Le profil agent est incomplet.");
  }

  return {
    id: data.id,
    nom: data.nom,
    agence: data.agence,
    role: data.role,
    actif: true
  };
}

export async function signOutAgent() {
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut();
}
