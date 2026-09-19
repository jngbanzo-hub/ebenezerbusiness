import "server-only";

import { createClient } from "@supabase/supabase-js";

type RawAdminProfile = {
  id?: unknown;
  actif?: unknown;
  role?: unknown;
  agence?: unknown;
};

type ResolvedAdminIdentity = {
  userId: string;
  email?: string;
  profile: RawAdminProfile | null;
};

export type AdminAuthorizationResult =
  | {
      authorized: true;
      userId: string;
      email: string;
      role: "ADMIN";
      agency: "COO" | "FIH" | "LSHI" | "KLZ" | null;
    }
  | { authorized: false; status: 401 | 403 };

type IdentityResolver = (token: string) => Promise<ResolvedAdminIdentity | null>;

export async function authorizeAdminRequest(
  request: Request,
  resolveIdentity: IdentityResolver = resolveSupabaseIdentity
): Promise<AdminAuthorizationResult> {
  const token = readBearerToken(request.headers.get("Authorization"));

  if (!token) {
    return { authorized: false, status: 401 };
  }

  const identity = await resolveIdentity(token);
  if (!identity) {
    return { authorized: false, status: 401 };
  }

  if (
    !identity.email?.trim() ||
    !isActiveAdminProfile(identity.profile, identity.userId)
  ) {
    return { authorized: false, status: 403 };
  }

  return {
    authorized: true,
    userId: identity.userId,
    email: identity.email,
    role: "ADMIN",
    agency: normalizeAdminAgency(identity.profile?.agence)
  };
}

export function isActiveAdminProfile(
  profile: RawAdminProfile | null,
  authenticatedUserId: string
) {
  return (
    profile !== null &&
    typeof profile.id === "string" &&
    profile.id === authenticatedUserId &&
    profile.actif === true &&
    typeof profile.role === "string" &&
    profile.role.trim().toUpperCase() === "ADMIN"
  );
}

async function resolveSupabaseIdentity(token: string): Promise<ResolvedAdminIdentity | null> {
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
    .select("id, actif, role, agence")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("Lecture du profil administrateur impossible.");
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    profile
  };
}

function normalizeAdminAgency(
  value: unknown
): "COO" | "FIH" | "LSHI" | "KLZ" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "COTONOU" || normalized === "COO") {
    return "COO";
  }

  return ["FIH", "LSHI", "KLZ"].includes(normalized)
    ? (normalized as "FIH" | "LSHI" | "KLZ")
    : null;
}

function readBearerToken(value: string | null) {
  if (!value) {
    return null;
  }

  return value.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}
