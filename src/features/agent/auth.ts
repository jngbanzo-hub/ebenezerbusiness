import type { User } from "@supabase/supabase-js";

import { isAgency } from "@/features/agent/agencies";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type {
  AdminProfile,
  AgentProfile,
  ProfessionalProfile
} from "@/features/agent/types";

interface RawProfile {
  id?: unknown;
  nom?: unknown;
  agence?: unknown;
  role?: unknown;
  actif?: unknown;
}

export function validateProfessionalProfile(data: RawProfile | null): ProfessionalProfile {
  if (!data) {
    throw new Error("Aucun profil professionnel n’est associé à ce compte.");
  }

  if (data.actif !== true) {
    throw new Error("Ce compte professionnel est inactif.");
  }

  if (
    typeof data.id !== "string" ||
    typeof data.nom !== "string" ||
    !data.nom.trim()
  ) {
    throw new Error("Le profil professionnel est incomplet.");
  }

  const role = typeof data.role === "string" ? data.role.trim().toUpperCase() : "";
  if (role !== "AGENT" && role !== "ADMIN") {
    throw new Error("Le rôle associé à ce profil n’est pas autorisé.");
  }

  return {
    id: data.id,
    nom: data.nom,
    role,
    actif: true
  };
}

async function loadProfile(user: User): Promise<RawProfile | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id, nom, agence, role, actif")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de vérifier le profil professionnel.");
  }

  return data;
}

export async function getProfessionalProfile(user: User): Promise<ProfessionalProfile> {
  return validateProfessionalProfile(await loadProfile(user));
}

export async function getAgentProfile(user: User): Promise<AgentProfile> {
  const data = await loadProfile(user);
  const profile = validateProfessionalProfile(data);

  if (profile.role !== "AGENT") {
    throw new Error("Cet espace est réservé aux agents.");
  }

  if (!data) {
    throw new Error("Aucun profil professionnel n’est associé à ce compte.");
  }

  if (!isAgency(data.agence)) {
    throw new Error("L’agence associée à ce profil est invalide.");
  }

  return {
    ...profile,
    agence: data.agence,
    role: "AGENT"
  };
}

export async function getAdminProfile(user: User): Promise<AdminProfile> {
  const profile = validateProfessionalProfile(await loadProfile(user));

  if (profile.role !== "ADMIN") {
    throw new Error("Cet espace est réservé aux administrateurs.");
  }

  return {
    ...profile,
    role: "ADMIN"
  };
}

export async function signOutAgent() {
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut();
}
