import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ErrorCode =
  | "SESSION_EXPIREE"
  | "COMPTE_DESACTIVE"
  | "ACCES_REFUSE"
  | "COLIS_INTROUVABLE"
  | "DESTINATION_INVALIDE"
  | "SERVICE_INDISPONIBLE";

type AgentProfile = {
  actif?: unknown;
  agence: string;
  id: string;
  role: string;
};

type ColisResponse = {
  codeColis: string;
  dateColis: string;
  destinationCode: string;
  destinationNom: string;
  poidsKg: number;
  montantAttendu: number;
  montantDejaPaye: number;
  soldeRestant: number;
  statutColis: string;
};

const AGENCE_DESTINATION: Readonly<Record<string, string>> = {
  COTONOU: "COO",
  FIH: "FIH",
  LSHI: "LSHI",
  KLZ: "KLZ",
};

const DESTINATION_NOM: Readonly<Record<string, string>> = {
  COO: "Cotonou",
  FIH: "Kinshasa",
  LSHI: "Lubumbashi",
  KLZ: "Kolwezi",
};

const ALLOWED_BODY_KEYS = new Set(["destinationCode", "codeColis"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }

  if (request.method !== "POST") {
    return errorResponse("ACCES_REFUSE", 405);
  }

  try {
    // Le jeton n'est accepté que sous la forme Authorization: Bearer <JWT>.
    const token = readBearerToken(request.headers.get("Authorization"));
    if (!token) {
      return errorResponse("SESSION_EXPIREE", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse("SERVICE_INDISPONIBLE", 503);
    }

    // getUser contacte Supabase Auth : le contenu du JWT n'est jamais cru seul.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return errorResponse("SESSION_EXPIREE", 401);
    }

    // Le profil est lu avec le contexte authentifié et uniquement avec les champs requis.
    const { data: rawAgent, error: profileError } = await supabase
      .from("agents")
      .select("id, agence, role, actif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return errorResponse("SERVICE_INDISPONIBLE", 503);
    }
    if (!isAgentProfile(rawAgent) || rawAgent.id !== user.id) {
      return errorResponse("ACCES_REFUSE", 403);
    }
    if (rawAgent.actif !== true) {
      return errorResponse("COMPTE_DESACTIVE", 403);
    }
    if (rawAgent.role.trim().toUpperCase() !== "AGENT") {
      return errorResponse("ACCES_REFUSE", 403);
    }

    const agence = rawAgent.agence.trim().toUpperCase();
    if (!AGENCE_DESTINATION[agence]) {
      return errorResponse("DESTINATION_INVALIDE", 403);
    }

    const body = await readRequestBody(request);
    if (!body || !hasOnlyAllowedKeys(body)) {
      return errorResponse("ACCES_REFUSE", 400);
    }

    // La sélection validée détermine exclusivement la destination recherchée.
    const destinationCode =
      typeof body.destinationCode === "string"
        ? body.destinationCode.trim().toUpperCase()
        : "";
    if (!["FIH", "LSHI", "KLZ"].includes(destinationCode)) {
      return errorResponse("DESTINATION_INVALIDE", 403);
    }
    const codeColis = normalizeCodeColis(body.codeColis);
    if (!codeColis) {
      return errorResponse("ACCES_REFUSE", 400);
    }

    const appsScriptUrl = Deno.env.get("PAIEMENTS_AGENTS_APPS_SCRIPT_URL")?.trim();
    const apiKey = Deno.env.get("PAIEMENTS_AGENTS_API_KEY")?.trim();
    if (!appsScriptUrl || !apiKey || !isHttpsUrl(appsScriptUrl)) {
      return errorResponse("SERVICE_INDISPONIBLE", 503);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), readTimeoutMs());

    try {
      // La clé Apps Script reste exclusivement dans l'environnement de la fonction.
      const upstreamResponse = await fetch(appsScriptUrl, {
        body: JSON.stringify({
          action: "rechercherColis",
          destinationCode,
          codeColis,
          apiKey,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });

      // Le délai reste actif pendant la lecture et l'analyse complète du corps.
      const upstreamPayload = await readUpstreamJson(upstreamResponse);
      if (
        upstreamResponse.status === 404 ||
        (isRecord(upstreamPayload) &&
          (upstreamPayload.found === false ||
            upstreamPayload.success === false &&
              containsNotFoundText(upstreamPayload)))
      ) {
        return errorResponse("COLIS_INTROUVABLE", 404);
      }
      if (!upstreamResponse.ok || upstreamPayload === null) {
        return errorResponse("SERVICE_INDISPONIBLE", 503);
      }

      const colis = sanitizeColis(upstreamPayload, destinationCode, codeColis);
      if (!colis) {
        return errorResponse("SERVICE_INDISPONIBLE", 503);
      }

      // Seule cette projection explicitement autorisée quitte la fonction.
      return jsonResponse(colis, 200);
    } catch {
      return errorResponse("SERVICE_INDISPONIBLE", 503);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Aucune stack trace ni information interne n'est exposée.
    return errorResponse("SERVICE_INDISPONIBLE", 503);
  }
});

function readBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

async function readRequestBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function normalizeCodeColis(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  // Limite volontaire pour éviter les valeurs vides, démesurées ou de contrôle.
  return /^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(normalized)
    ? normalized
    : null;
}

function hasOnlyAllowedKeys(body: Record<string, unknown>): boolean {
  return Object.keys(body).every((key) => ALLOWED_BODY_KEYS.has(key));
}

function isAgentProfile(value: unknown): value is AgentProfile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.agence === "string" &&
    typeof value.role === "string"
  );
}

function readTimeoutMs(): number {
  const configured = Number(Deno.env.get("PAIEMENTS_AGENTS_TIMEOUT_MS"));
  if (!Number.isFinite(configured) || configured <= 0) return 12_000;
  return Math.min(Math.max(1, Math.ceil(configured)), 12_000);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function readUpstreamJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function containsNotFoundText(payload: Record<string, unknown>): boolean {
  const description = [payload.error, payload.message, payload.code]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /introuvable|non trouv|not found|aucun colis/.test(description);
}

function sanitizeColis(
  payload: unknown,
  authorizedDestination: string,
  requestedCode: string,
): ColisResponse | null {
  const candidate = extractColis(payload);
  if (!isRecord(candidate)) return null;

  const codeColis = readText(candidate.codeColis);
  const dateColis = readText(candidate.dateColis);
  const responseDestination = readText(candidate.destinationCode)?.toUpperCase();
  const destinationNom =
    readText(candidate.destinationNom) ?? DESTINATION_NOM[authorizedDestination];
  const poidsKg = readNumber(candidate.poidsKg);
  const montantAttendu = readNumber(candidate.montantAttendu);
  const montantDejaPaye = readNumber(candidate.montantDejaPaye);
  const soldeRestant = readNumber(candidate.soldeRestant);
  const statutColis = readText(candidate.statutColis);

  // Empêche une réponse amont de substituer un autre colis ou une autre destination.
  if (
    !codeColis ||
    codeColis.toUpperCase() !== requestedCode ||
    responseDestination !== authorizedDestination ||
    !dateColis ||
    !destinationNom ||
    poidsKg === null ||
    montantAttendu === null ||
    montantDejaPaye === null ||
    soldeRestant === null ||
    !statutColis
  ) {
    return null;
  }

  return {
    codeColis,
    dateColis,
    destinationCode: authorizedDestination,
    destinationNom,
    poidsKg,
    montantAttendu,
    montantDejaPaye,
    soldeRestant,
    statutColis,
  };
}

function extractColis(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  return payload.data ?? payload.result ?? payload.colis ?? payload;
}

function readText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length > 0 && normalized.length <= 256 ? normalized : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const normalized =
    typeof value === "string"
      ? value.replace(",", ".").replace(/\s/g, "")
      : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(code: ErrorCode, status: number): Response {
  return jsonResponse({ error: code }, status);
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });
}
