import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ErrorCode =
  | "SESSION_EXPIREE"
  | "COMPTE_DESACTIVE"
  | "ACCES_REFUSE"
  | "COLIS_INTROUVABLE"
  | "DESTINATION_INVALIDE"
  | "AGENCE_INVALIDE"
  | "MONTANT_INVALIDE"
  | "MODE_PAIEMENT_INVALIDE"
  | "PAYMENT_REQUEST_ID_INVALIDE"
  | "PAIEMENT_DEJA_ENREGISTRE"
  | "DEPASSEMENT_SOLDE"
  | "COLIS_DEJA_SOLDE"
  | "MONTANT_SUPERIEUR_SOLDE"
  | "PAIEMENT_PARTIEL_INTERDIT"
  | "PAIEMENT_REFUSE"
  | "SERVICE_INDISPONIBLE";

type AgentProfile = {
  actif?: unknown;
  agence: string;
  id: string;
  nom: string;
};

type PaymentInput = {
  codeColis: string;
  destinationCode: string;
  montantPaye: number;
  modePaiement: string;
  paymentRequestId?: string;
  referencePaiement: string;
  observation: string;
};

type PublicPaymentResponse = {
  codeColis: string;
  destinationCode: string;
  destinationNom: string;
  montantPaye: number;
  nouveauTotalPaye: number;
  nouveauSolde: number;
  statutPaiement: "SOLDE" | "PARTIELLEMENT PAYE";
  datePaiement: string;
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

const ALLOWED_BODY_KEYS = new Set([
  "codeColis",
  "destinationCode",
  "montantPaye",
  "modePaiement",
  "paymentRequestId",
  "referencePaiement",
  "observation",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
};

const PUBLIC_UPSTREAM_ERRORS: Readonly<
  Partial<Record<ErrorCode, { status: number; defaultMessage: string }>>
> = {
  PAIEMENT_DEJA_ENREGISTRE: {
    status: 409,
    defaultMessage: "Ce paiement a déjà été enregistré.",
  },
  MONTANT_INVALIDE: {
    status: 400,
    defaultMessage: "Le montant payé est invalide.",
  },
  MODE_PAIEMENT_INVALIDE: {
    status: 400,
    defaultMessage: "Le mode de paiement est invalide.",
  },
  PAYMENT_REQUEST_ID_INVALIDE: {
    status: 400,
    defaultMessage:
      "L’identifiant de la demande de paiement est invalide.",
  },
  DEPASSEMENT_SOLDE: {
    status: 400,
    defaultMessage: "Le montant payé dépasse le solde restant.",
  },
  COLIS_DEJA_SOLDE: {
    status: 409,
    defaultMessage: "Ce colis est déjà soldé.",
  },
  MONTANT_SUPERIEUR_SOLDE: {
    status: 400,
    defaultMessage: "Le montant payé dépasse le solde restant.",
  },
  PAIEMENT_PARTIEL_INTERDIT: {
    status: 400,
    defaultMessage:
      "Le paiement partiel n’est pas autorisé pour cette agence.",
  },
  AGENCE_INVALIDE: {
    status: 403,
    defaultMessage: "L’agence d’encaissement est invalide.",
  },
  DESTINATION_INVALIDE: {
    status: 403,
    defaultMessage: "La destination est invalide.",
  },
  COLIS_INTROUVABLE: {
    status: 404,
    defaultMessage: "Le colis est introuvable.",
  },
  PAIEMENT_REFUSE: {
    status: 400,
    defaultMessage: "Le paiement a été refusé.",
  },
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }
  if (request.method !== "POST") {
    return errorResponse("ACCES_REFUSE", 405);
  }

  try {
    const token = readBearerToken(request.headers.get("Authorization"));
    if (!token) {
      return errorResponse("SESSION_EXPIREE", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse("SERVICE_INDISPONIBLE", 503);
    }

    // getUser valide réellement le JWT auprès de Supabase Auth.
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

    // Le profil est lu dans public.agents avec l'identité issue du JWT validé.
    const { data: rawAgent, error: profileError } = await supabase
      .schema("public")
      .from("agents")
      .select("id, nom, agence, actif")
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

    const agence = rawAgent.agence.trim().toUpperCase();
    const agenceEncaissement = AGENCE_DESTINATION[agence];
    if (!agenceEncaissement) {
      return errorResponse("DESTINATION_INVALIDE", 403);
    }

    const body = await readRequestBody(request);
    if (!body || !hasOnlyAllowedKeys(body)) {
      return errorResponse("ACCES_REFUSE", 400);
    }

    const paymentRequestId = normalizeOptionalPaymentRequestId(
      body.paymentRequestId,
    );
    if (paymentRequestId === null) {
      return errorResponse("PAYMENT_REQUEST_ID_INVALIDE", 400);
    }

    const paymentInput = parsePaymentInput(body, paymentRequestId);
    if (!paymentInput) {
      return errorResponse("MONTANT_INVALIDE", 400);
    }

    const destinationCode = paymentInput.destinationCode;
    const routeAutorisee =
      agenceEncaissement === "COO"
        ? ["FIH", "LSHI", "KLZ"].includes(destinationCode)
        : agenceEncaissement === destinationCode;
    if (!routeAutorisee) {
      return errorResponse("AGENCE_INVALIDE", 403);
    }

    const appsScriptUrl =
      Deno.env.get("PAIEMENTS_AGENTS_APPS_SCRIPT_URL")?.trim();
    const apiKey = Deno.env.get("PAIEMENTS_AGENTS_API_KEY")?.trim();
    if (!appsScriptUrl || !apiKey || !isHttpsUrl(appsScriptUrl)) {
      return errorResponse("SERVICE_INDISPONIBLE", 503);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), readTimeoutMs());

    try {
      const appsScriptPayload: Record<string, unknown> = {
        action: "enregistrerPaiement",
        destinationCode,
        agenceEncaissement,
        agent: rawAgent.nom.trim(),
        codeColis: paymentInput.codeColis,
        montantPaye: paymentInput.montantPaye,
        modePaiement: paymentInput.modePaiement,
        referencePaiement: paymentInput.referencePaiement,
        observation: paymentInput.observation,
        // Une écriture réelle ne peut être demandée que par ce littéral serveur.
        simulation: false,
        apiKey,
      };

      if (paymentInput.paymentRequestId !== undefined) {
        appsScriptPayload.paymentRequestId =
          paymentInput.paymentRequestId;
      }

      const upstreamResponse = await fetch(appsScriptUrl, {
        body: JSON.stringify(appsScriptPayload),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });

      const upstreamPayload = await readUpstreamJson(upstreamResponse);
      if (!upstreamResponse.ok || upstreamPayload === null) {
        const code = classifyUpstreamError(
          upstreamResponse.status,
          upstreamPayload,
        );
        return upstreamErrorResponse(code, statusForError(code));
      }
      if (
        isRecord(upstreamPayload) &&
        upstreamPayload.success === false
      ) {
        const publicError = readPublicUpstreamError(upstreamPayload);
        if (publicError !== null) {
          return upstreamErrorResponse(
            publicError.code,
            publicError.status,
            publicError.message,
          );
        }

        return errorResponse(
          "PAIEMENT_REFUSE",
          statusForError("PAIEMENT_REFUSE"),
          "Le paiement a été refusé.",
        );
      }

      const publicPayment = sanitizePaymentResponse(
        upstreamPayload,
        paymentInput,
        destinationCode,
      );
      if (!publicPayment) {
        return errorResponse("SERVICE_INDISPONIBLE", 503);
      }

      return jsonResponse(publicPayment, 200);
    } catch {
      return errorResponse("SERVICE_INDISPONIBLE", 503);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Aucune exception, stack trace ou donnée interne n'est exposée.
    return errorResponse("SERVICE_INDISPONIBLE", 503);
  }
});

function readBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  return authorization.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
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

function hasOnlyAllowedKeys(body: Record<string, unknown>): boolean {
  return Object.keys(body).every((key) => ALLOWED_BODY_KEYS.has(key));
}

function parsePaymentInput(
  body: Record<string, unknown>,
  paymentRequestId: string | undefined,
): PaymentInput | null {
  const codeColis = normalizeCodeColis(body.codeColis);
  const destinationCode = normalizePaymentDestination(body.destinationCode);
  const montantPaye = normalizeAmount(body.montantPaye);
  const modePaiement = normalizePaymentMode(body.modePaiement);
  const referencePaiement = normalizeOptionalText(
    body.referencePaiement,
    128,
  );
  const observation = normalizeOptionalText(body.observation, 500);

  if (
    !codeColis ||
    !destinationCode ||
    montantPaye === null ||
    modePaiement === null ||
    referencePaiement === null ||
    observation === null
  ) {
    return null;
  }

  return {
    codeColis,
    destinationCode,
    montantPaye,
    modePaiement,
    ...(paymentRequestId === undefined ? {} : { paymentRequestId }),
    referencePaiement,
    observation,
  };
}

function normalizeOptionalPaymentRequestId(
  value: unknown,
): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalized,
    )
    ? normalized
    : null;
}

function normalizePaymentDestination(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return ["FIH", "LSHI", "KLZ"].includes(normalized) ? normalized : null;
}

function normalizePaymentMode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return ["ESPECES", "MOBILE MONEY", "VIREMENT", "AUTRE"].includes(
      normalized,
    )
    ? normalized
    : null;
}

function normalizeCodeColis(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(normalized)
    ? normalized
    : null;
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > 1_000_000_000) return null;
  const rounded = Math.round(value * 100) / 100;
  return Math.abs(value - rounded) < 1e-9 ? rounded : null;
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
): string | null {
  if (value === undefined) return "";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
}

function isAgentProfile(value: unknown): value is AgentProfile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.nom === "string" &&
    value.nom.trim().length > 0 &&
    typeof value.agence === "string"
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

function readPublicUpstreamError(
  payload: unknown,
): { code: ErrorCode; message: string; status: number } | null {
  if (!isRecord(payload) || typeof payload.code !== "string") {
    return null;
  }

  const code = payload.code.trim().toUpperCase() as ErrorCode;
  const configuration = PUBLIC_UPSTREAM_ERRORS[code];
  if (configuration === undefined) {
    return null;
  }

  const upstreamMessage =
    typeof payload.message === "string"
      ? payload.message
          .replace(/[\u0000-\u001F\u007F]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300)
      : "";

  return {
    code,
    status: configuration.status,
    message: upstreamMessage || configuration.defaultMessage,
  };
}

function sanitizePaymentResponse(
  payload: unknown,
  input: PaymentInput,
  authorizedDestination: string,
): PublicPaymentResponse | null {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    payload.simulation !== false
  ) {
    return null;
  }

  const payment = payload.paiement;
  if (!isRecord(payment)) return null;

  const codeColis = readText(payment.codeColis, 64);
  const responseDestination = readText(payment.destinationCode, 16);
  const montantPaye = readNumber(payment.montantPaye);
  const nouveauTotalPaye = readNumber(payment.nouveauTotalPaye);
  const nouveauSolde = readNumber(payment.nouveauSolde);
  const statutPaiement = readText(payment.statutPaiement, 64);
  const datePaiement = readText(payment.datePaiement, 128);

  if (
    !codeColis ||
    codeColis.toUpperCase() !== input.codeColis ||
    !responseDestination ||
    responseDestination.toUpperCase() !== authorizedDestination ||
    montantPaye === null ||
    Math.abs(montantPaye - input.montantPaye) >= 1e-9 ||
    nouveauTotalPaye === null ||
    nouveauSolde === null ||
    (statutPaiement !== "SOLDE" &&
      statutPaiement !== "PARTIELLEMENT PAYE") ||
    !datePaiement
  ) {
    return null;
  }

  return {
    codeColis,
    destinationCode: authorizedDestination,
    destinationNom: DESTINATION_NOM[authorizedDestination],
    montantPaye,
    nouveauTotalPaye,
    nouveauSolde,
    statutPaiement,
    datePaiement,
  };
}

function classifyUpstreamError(
  status: number,
  payload: unknown,
): ErrorCode {
  if (
    isRecord(payload) &&
    payload.code === "PAIEMENT_DEJA_ENREGISTRE"
  ) {
    return "PAIEMENT_DEJA_ENREGISTRE";
  }

  const description = isRecord(payload)
    ? [payload.error, payload.code, payload.message]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toUpperCase()
    : "";

  if (status === 404 || /COLIS.*INTROUV|AUCUN.*COLIS|NOT.*FOUND/.test(description)) {
    return "COLIS_INTROUVABLE";
  }
  if (/DEJA.*SOLDE|DÉJÀ.*SOLDÉ/.test(description)) {
    return "COLIS_DEJA_SOLDE";
  }
  if (/SUPERIEUR.*SOLDE|SUPÉRIEUR.*SOLDE|DEPASS.*SOLDE|DÉPASS.*SOLDE/.test(description)) {
    return "MONTANT_SUPERIEUR_SOLDE";
  }
  if (/PARTIEL/.test(description)) {
    return "PAIEMENT_PARTIEL_INTERDIT";
  }
  if (/MONTANT/.test(description)) {
    return "MONTANT_INVALIDE";
  }
  if (/DESTINATION|AGENCE/.test(description)) {
    return "DESTINATION_INVALIDE";
  }
  if (/PAIEMENT.*REFUS|DOUBLON|DUPLICATE/.test(description)) {
    return "PAIEMENT_REFUSE";
  }
  return "SERVICE_INDISPONIBLE";
}

function statusForError(code: ErrorCode): number {
  if (code === "COLIS_INTROUVABLE") return 404;
  if (
    code === "PAIEMENT_DEJA_ENREGISTRE" ||
    code === "COLIS_DEJA_SOLDE"
  ) {
    return 409;
  }
  if (
    code === "MONTANT_INVALIDE" ||
    code === "MODE_PAIEMENT_INVALIDE" ||
    code === "DEPASSEMENT_SOLDE" ||
    code === "MONTANT_SUPERIEUR_SOLDE" ||
    code === "PAIEMENT_PARTIEL_INTERDIT" ||
    code === "PAIEMENT_REFUSE"
  ) {
    return 400;
  }
  if (
    code === "DESTINATION_INVALIDE" ||
    code === "AGENCE_INVALIDE"
  ) {
    return 403;
  }
  return 503;
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : null;
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

function errorResponse(
  code: ErrorCode,
  status: number,
  message?: string,
): Response {
  return jsonResponse(
    message === undefined ? { error: code } : { error: code, message },
    status,
  );
}

function upstreamErrorResponse(
  code: ErrorCode,
  status: number,
  message?: string,
): Response {
  if (code === "PAIEMENT_DEJA_ENREGISTRE") {
    return jsonResponse(
      {
        success: false,
        code,
        message: "Ce paiement a déjà été enregistré.",
      },
      409,
    );
  }

  return errorResponse(code, status, message);
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });
}
