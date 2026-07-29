import "server-only";

import { createClient } from "@supabase/supabase-js";

import { isAgency } from "@/features/agent/agencies";
import type { Agency } from "@/features/agent/types";

type RawAgentProfile = {
  id?: unknown;
  nom?: unknown;
  agence?: unknown;
  role?: unknown;
  actif?: unknown;
};

type ResolvedAgentIdentity = {
  userId: string;
  email: string;
  profile: RawAgentProfile | null;
};

export type AuthorizedAgentIdentity = {
  userId: string;
  email: string;
  nom: string;
  role: "AGENT";
  agence: Agency;
  site: "COO" | "FIH" | "LSHI" | "KLZ";
};

export type AgentAuthorizationResult =
  | { authorized: true; identity: AuthorizedAgentIdentity }
  | { authorized: false; status: 401 | 403 };

type IdentityResolver = (
  token: string
) => Promise<ResolvedAgentIdentity | null>;

const SITE_BY_AGENCY: Record<
  Agency,
  AuthorizedAgentIdentity["site"]
> = {
  COTONOU: "COO",
  FIH: "FIH",
  LSHI: "LSHI",
  KLZ: "KLZ"
};

export async function authorizeAgentRequest(
  request: Request,
  resolveIdentity: IdentityResolver = resolveSupabaseIdentity
): Promise<AgentAuthorizationResult> {
  const token = readBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return { authorized: false, status: 401 };
  }

  const resolved = await resolveIdentity(token);
  if (!resolved) {
    return { authorized: false, status: 401 };
  }
  if (!resolved.email?.trim()) {
    return { authorized: false, status: 403 };
  }

  const identity = validateAgentIdentity(
    resolved.profile,
    resolved.userId,
    resolved.email
  );
  return identity
    ? { authorized: true, identity }
    : { authorized: false, status: 403 };
}

export function validateAgentIdentity(
  profile: RawAgentProfile | null,
  authenticatedUserId: string,
  authenticatedEmail = ""
): AuthorizedAgentIdentity | null {
  if (
    profile === null ||
    typeof profile.id !== "string" ||
    profile.id !== authenticatedUserId ||
    typeof profile.nom !== "string" ||
    !profile.nom.trim() ||
    profile.actif !== true ||
    typeof profile.role !== "string" ||
    profile.role.trim().toUpperCase() !== "AGENT"
  ) {
    return null;
  }

  const agence =
    typeof profile.agence === "string"
      ? profile.agence.trim().toUpperCase()
      : "";
  if (!isAgency(agence)) {
    return null;
  }

  return {
    userId: authenticatedUserId,
    email: authenticatedEmail,
    nom: profile.nom.trim(),
    role: "AGENT",
    agence,
    site: SITE_BY_AGENCY[agence]
  };
}

async function resolveSupabaseIdentity(
  token: string
): Promise<ResolvedAgentIdentity | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Configuration Supabase serveur manquante.");
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .schema("public")
    .from("agents")
    .select("id, nom, agence, role, actif")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("Lecture du profil Agent impossible.");
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    profile
  };
}

function readBearerToken(value: string | null) {
  if (!value) {
    return null;
  }

  return value.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}
