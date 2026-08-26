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
  | "STATUT_COLIS_INVALIDE"
  | "IDEMPOTENCY_CONFLICT"
  | "PARCEL_NOT_IN_STOCK"
  | "STOCK_INSUFFICIENT"
  | "PAYMENT_ORCHESTRATION_INCOMPLETE"
  | "SERVICE_INDISPONIBLE";

type AgentProfile = {
  actif?: unknown;
  agence: string;
  id: string;
  nom: string;
  role: string;
};

type PaymentInput = {
  codeColis: string;
  destinationCode: string;
  montantPaye: number;
  modePaiement: string;
  paymentRequestId: string;
  referencePaiement: string;
  observation: string;
  operationContext: PaymentOperationContext;
};

type PaymentOperationContext =
  | { type: "STANDARD_PAYMENT"; sourceDestinationCode: string; collectionSiteCode: string }
  | { type: "STORAGE_DESTINATION_PAYMENT"; sourceDestinationCode: string; collectionSiteCode: string; canonicalWeightKg: number; canonicalExpectedAmount: number; canonicalTotalPaid: number }
  | { type: "INTER_AGENCY_FORWARDING"; sourceDestinationCode: string; collectionSiteCode: string; forwardingDestinationCode: string; forwardingReference: string };

type PublicPaymentResponse = {
  codeColis: string;
  destinationCode: string;
  destinationNom: string;
  montantPaye: number;
  nouveauTotalPaye: number;
  nouveauSolde: number;
  statutPaiement: "SOLDE" | "PARTIELLEMENT PAYE";
  datePaiement: string;
  cashRecorded?: boolean;
  cashStatus?: "RECORDED" | "ACCOUNT_NOT_ACTIVE";
  replayed?: boolean;
};

type CashCreditRow = {
  actor_user_id: string;
  agency: string;
  amount: number | string;
  event_id: string;
  metadata: unknown;
  version_after: number;
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
  "operationContext",
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
  STATUT_COLIS_INVALIDE: {
    status: 400,
    defaultMessage:
      "Le statut du colis est incompatible avec la feuille de paiement.",
  },
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }
  if (request.method !== "POST") {
    return errorResponse("ACCES_REFUSE", 405);
  }

  const performanceTrace = new PaymentPerformanceTrace();
  const authStartedAt = performance.now();

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
      .select("id, nom, agence, role, actif")
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
    const agenceEncaissement = AGENCE_DESTINATION[agence];
    if (!agenceEncaissement) {
      return errorResponse("DESTINATION_INVALIDE", 403);
    }
    performanceTrace.add("edge_auth_profile", authStartedAt);

    const validationStartedAt = performance.now();
    const body = await readRequestBody(request);
    if (!body || !hasOnlyAllowedKeys(body)) {
      return errorResponse("ACCES_REFUSE", 400);
    }

    const internalForwarding = body.operationContext !== undefined;
    if (internalForwarding && !await verifyInternalOrchestration(request, body)) {
      return errorResponse("ACCES_REFUSE", 403);
    }

    const paymentRequestId = normalizePaymentRequestId(body.paymentRequestId);
    if (paymentRequestId === null) {
      return errorResponse("PAYMENT_REQUEST_ID_INVALIDE", 400);
    }
    performanceTrace.setContext(paymentRequestId, agenceEncaissement);

    const paymentInput = parsePaymentInput(body, paymentRequestId, agenceEncaissement, internalForwarding);
    if (!paymentInput) {
      return errorResponse("MONTANT_INVALIDE", 400);
    }

    const destinationCode = paymentInput.operationContext.sourceDestinationCode;
    const isInterAgencyForwarding = paymentInput.operationContext.type === "INTER_AGENCY_FORWARDING";
    const isStorageDestinationPayment = paymentInput.operationContext.type === "STORAGE_DESTINATION_PAYMENT";
    const routeAutorisee =
      isInterAgencyForwarding
        ? paymentInput.operationContext.collectionSiteCode === agenceEncaissement &&
          paymentInput.operationContext.forwardingDestinationCode === agenceEncaissement &&
          destinationCode !== agenceEncaissement &&
          ["FIH", "LSHI", "KLZ"].includes(agenceEncaissement)
        : isStorageDestinationPayment
        ? agenceEncaissement === destinationCode && ["FIH", "LSHI", "KLZ"].includes(agenceEncaissement)
        : agenceEncaissement === "COO"
        ? ["FIH", "LSHI", "KLZ"].includes(destinationCode)
        : agenceEncaissement === destinationCode;
    if (!routeAutorisee) {
      return errorResponse("AGENCE_INVALIDE", 403);
    }

    const cashCreditsEnabled =
      Deno.env.get("CASH_PAYMENT_CREDITS_ENABLED")?.trim().toLowerCase() ===
      "true";
    const paidExitEnabled =
      Deno.env.get("STOCKAGES_PAID_EXIT_ENABLED")?.trim().toLowerCase() ===
      "true";
    const cashAgency = agenceEncaissement === "COO" ? null : agenceEncaissement;
    const commandFingerprint = await paymentFingerprint(
      paymentInput,
      cashAgency,
      user.id,
    );
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const cashClient = cashCreditsEnabled && cashAgency && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;
    if (cashCreditsEnabled && cashAgency && !cashClient) {
      return errorResponse("SERVICE_INDISPONIBLE", 503);
    }

    const usePaidExitOrchestration = Boolean(
      paidExitEnabled && cashClient && cashAgency === destinationCode && !isInterAgencyForwarding,
    );
    performanceTrace.add("validation", validationStartedAt);
    if (usePaidExitOrchestration && cashClient && cashAgency) {
      const beginStartedAt = performance.now();
      const begun = await cashClient.rpc("begin_paid_destination_orchestration", {
        p_actor_id: user.id,
        p_agency: cashAgency,
        p_command_fingerprint: commandFingerprint,
        p_expected_amount: paymentInput.montantPaye,
        p_paid_amount: paymentInput.montantPaye,
        p_request_id: paymentInput.paymentRequestId,
        p_tracking_code: paymentInput.codeColis,
      });
      performanceTrace.add("begin_orchestration", beginStartedAt);
      if (begun.error) return orchestrationError(begun.error.message);
      const checkpoint = isRecord(begun.data) ? begun.data : null;
      const storedPayment = sanitizeStoredPayment(checkpoint?.paymentResponse);
      if (checkpoint?.state === "COMPLETED" && storedPayment) {
        return performanceTrace.finish(jsonResponse({ ...storedPayment, cashRecorded: true, cashStatus: "RECORDED", replayed: true }, 200), "SUCCESS_REPLAY");
      }
      if (checkpoint?.paymentCreated === true && storedPayment) {
        const finalizeStartedAt = performance.now();
        const resumed = await finalizePaidExit(cashClient, paymentInput, commandFingerprint);
        performanceTrace.add("finalize_orchestration", finalizeStartedAt);
        if (resumed.kind === "ERROR") return orchestrationError(resumed.code);
        return performanceTrace.finish(jsonResponse({ ...storedPayment, cashRecorded: true, cashStatus: "RECORDED", replayed: true }, 200), "SUCCESS_RESUMED");
      }
    }

    if (cashClient && !usePaidExitOrchestration) {
      const replayStartedAt = performance.now();
      const replay = await readCashCreditReplay(
        cashClient,
        paymentInput.paymentRequestId,
        commandFingerprint,
      );
      performanceTrace.add("idempotency_replay", replayStartedAt);
      if (replay.kind === "CONFLICT") {
        return errorResponse("IDEMPOTENCY_CONFLICT", 409);
      }
      if (replay.kind === "REPLAY") {
        return performanceTrace.finish(jsonResponse({ ...replay.payment, replayed: true }, 200), "SUCCESS_REPLAY");
      }
      if (replay.kind === "ERROR") {
        return errorResponse("SERVICE_INDISPONIBLE", 503);
      }
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

      if (isInterAgencyForwarding) {
        appsScriptPayload.operationType = paymentInput.operationContext.type;
        appsScriptPayload.sourceDestinationCode = paymentInput.operationContext.sourceDestinationCode;
        appsScriptPayload.collectionSiteCode = paymentInput.operationContext.collectionSiteCode;
        appsScriptPayload.forwardingDestinationCode = paymentInput.operationContext.forwardingDestinationCode;
        appsScriptPayload.forwardingReference = paymentInput.operationContext.forwardingReference;
      }
      if (isStorageDestinationPayment) {
        appsScriptPayload.operationType = paymentInput.operationContext.type;
        appsScriptPayload.sourceDestinationCode = paymentInput.operationContext.sourceDestinationCode;
        appsScriptPayload.collectionSiteCode = paymentInput.operationContext.collectionSiteCode;
        appsScriptPayload.canonicalWeightKg = paymentInput.operationContext.canonicalWeightKg;
        appsScriptPayload.canonicalExpectedAmount = paymentInput.operationContext.canonicalExpectedAmount;
        appsScriptPayload.canonicalTotalPaid = paymentInput.operationContext.canonicalTotalPaid;
      }

      appsScriptPayload.paymentRequestId = paymentInput.paymentRequestId;

      const appsScriptStartedAt = performance.now();
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
      performanceTrace.add("apps_script_payment", appsScriptStartedAt);
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

      if (usePaidExitOrchestration && cashClient) {
        const checkpointStartedAt = performance.now();
        const checkpoint = await cashClient.rpc("checkpoint_paid_destination_payment", {
          p_command_fingerprint: commandFingerprint,
          p_payment_response: publicPayment,
          p_request_id: paymentInput.paymentRequestId,
        });
        performanceTrace.add("checkpoint", checkpointStartedAt);
        if (checkpoint.error) return orchestrationError(checkpoint.error.message);
        const finalizeStartedAt = performance.now();
        const finalized = await finalizePaidExit(cashClient, paymentInput, commandFingerprint);
        performanceTrace.add("finalize_orchestration", finalizeStartedAt);
        if (finalized.kind === "ERROR") return orchestrationError(finalized.code);
        return performanceTrace.finish(jsonResponse({ ...publicPayment, cashRecorded: true, cashStatus: "RECORDED", replayed: finalized.replayed }, 200), "SUCCESS");
      }

      if (cashClient && cashAgency) {
        const cashStartedAt = performance.now();
        const credit = await cashClient.rpc("record_cash_payment_credit", {
          p_actor_name: rawAgent.nom.trim(),
          p_actor_user_id: user.id,
          p_agency: cashAgency,
          p_amount: publicPayment.montantPaye,
          p_business_date: businessDateInPortoNovo(),
          p_command_fingerprint: commandFingerprint,
          p_metadata: {
            modePaiement: paymentInput.modePaiement,
            observation: paymentInput.observation,
            paymentType: publicPayment.statutPaiement === "SOLDE" ? "SOLDE" : "FRET",
            paymentResult: publicPayment,
            referencePaiement: paymentInput.referencePaiement,
            operationContext: paymentInput.operationContext,
          },
          p_occurred_at: new Date().toISOString(),
          p_payment_reference: paymentInput.codeColis,
          p_payment_request_id: paymentInput.paymentRequestId,
        });
        performanceTrace.add("cash", cashStartedAt);
        if (credit.error) {
          if (String(credit.error.message).includes("CASH_ACCOUNT_NOT_ACTIVE")) {
            return performanceTrace.finish(jsonResponse({
              ...publicPayment,
              cashRecorded: false,
              cashStatus: "ACCOUNT_NOT_ACTIVE",
              replayed: false,
            }, 200), "SUCCESS_CASH_ACCOUNT_INACTIVE");
          }
          return errorResponse(
            String(credit.error.message).includes("IDEMPOTENCY_CONFLICT")
              ? "IDEMPOTENCY_CONFLICT"
              : "SERVICE_INDISPONIBLE",
            String(credit.error.message).includes("IDEMPOTENCY_CONFLICT")
              ? 409
              : 503,
          );
        }
        const replayed = isRecord(credit.data) && credit.data.replayed === true;
        return performanceTrace.finish(jsonResponse({
          ...publicPayment,
          cashRecorded: true,
          cashStatus: "RECORDED",
          replayed,
        }, 200), "SUCCESS");
      }

      // COO reste volontairement hors caisse canonique.
      return performanceTrace.finish(jsonResponse({ ...publicPayment, replayed: false }, 200), "SUCCESS_COO_HORS_CAISSE");
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

class PaymentPerformanceTrace {
  private readonly startedAt = performance.now();
  private readonly durations: Record<string, number> = {};
  private agency = "UNKNOWN";
  private requestId = "UNKNOWN";
  private completed = false;

  add(step: string, startedAt: number): void {
    this.durations[step] = roundDuration(performance.now() - startedAt);
  }

  setContext(requestId: string, agency: string): void {
    this.requestId = requestId;
    this.agency = agency;
  }

  finish(response: Response, result: string): Response {
    if (!this.completed) {
      this.completed = true;
      console.info(JSON.stringify({
        event: "payment_operation_performance",
        requestId: this.requestId,
        agency: this.agency,
        result,
        status: response.status,
        totalMs: roundDuration(performance.now() - this.startedAt),
        durationsMs: this.durations,
      }));
    }
    return response;
  }
}

function roundDuration(value: number): number {
  return Math.round(value * 10) / 10;
}

async function finalizePaidExit(
  client: ReturnType<typeof createClient>,
  input: PaymentInput,
  fingerprint: string,
): Promise<{ kind: "SUCCESS"; replayed: boolean } | { kind: "ERROR"; code: string }> {
  const result = await client.rpc("finalize_paid_destination_orchestration", {
    p_business_date: businessDateInPortoNovo(),
    p_command_fingerprint: fingerprint,
    p_observation: input.observation,
    p_payment_mode: input.modePaiement,
    p_payment_reference: input.referencePaiement,
    p_request_id: input.paymentRequestId,
  });
  if (result.error) return { kind: "ERROR", code: result.error.message };
  if (!isRecord(result.data) || result.data.state !== "COMPLETED") {
    return { kind: "ERROR", code: isRecord(result.data) && typeof result.data.code === "string" ? result.data.code : "PAYMENT_ORCHESTRATION_INCOMPLETE" };
  }
  return { kind: "SUCCESS", replayed: result.data.replayed === true };
}

function orchestrationError(value: string): Response {
  const code: ErrorCode = value.includes("IDEMPOTENCY_CONFLICT")
    ? "IDEMPOTENCY_CONFLICT"
    : value.includes("PARCEL_NOT_IN_STOCK")
      ? "PARCEL_NOT_IN_STOCK"
      : value.includes("STOCK_INSUFFICIENT")
        ? "STOCK_INSUFFICIENT"
        : "PAYMENT_ORCHESTRATION_INCOMPLETE";
  return errorResponse(code, code === "IDEMPOTENCY_CONFLICT" ? 409 : 503);
}

function readBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  return authorization.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

async function paymentFingerprint(
  input: PaymentInput,
  agency: string | null,
  actorUserId: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({
    actorUserId,
    agency,
    codeColis: input.codeColis,
    destinationCode: input.destinationCode,
    modePaiement: input.modePaiement,
    montantPaye: input.montantPaye,
    observation: input.observation,
    referencePaiement: input.referencePaiement,
    operationContext: input.operationContext,
  }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function readCashCreditReplay(
  cashClient: ReturnType<typeof createClient>,
  requestId: string,
  fingerprint: string,
): Promise<
  | { kind: "NONE" }
  | { kind: "ERROR" }
  | { kind: "CONFLICT" }
  | { kind: "REPLAY"; payment: PublicPaymentResponse }
> {
  const { data, error } = await cashClient
    .schema("public")
    .from("cash_events")
    .select("event_id, agency, amount, actor_user_id, version_after, metadata")
    .eq("source_type", "PAYMENT_ENGINE")
    .eq("source_request_id", requestId)
    .maybeSingle();
  if (error) return { kind: "ERROR" };
  if (!data) return { kind: "NONE" };
  const row = data as CashCreditRow;
  if (!isRecord(row.metadata) || row.metadata.commandFingerprint !== fingerprint) {
    return { kind: "CONFLICT" };
  }
  const payment = row.metadata.paymentResult;
  return sanitizeStoredPayment(payment) === null
    ? { kind: "ERROR" }
    : { kind: "REPLAY", payment: sanitizeStoredPayment(payment)! };
}

function sanitizeStoredPayment(value: unknown): PublicPaymentResponse | null {
  if (!isRecord(value)) return null;
  const codeColis = readText(value.codeColis, 64);
  const destinationCode = readText(value.destinationCode, 16);
  const destinationNom = readText(value.destinationNom, 64);
  const montantPaye = readNumber(value.montantPaye);
  const nouveauTotalPaye = readNumber(value.nouveauTotalPaye);
  const nouveauSolde = readNumber(value.nouveauSolde);
  const statutPaiement = readText(value.statutPaiement, 64);
  const datePaiement = readText(value.datePaiement, 128);
  if (!codeColis || !destinationCode || !destinationNom || montantPaye === null ||
    nouveauTotalPaye === null || nouveauSolde === null || !datePaiement ||
    (statutPaiement !== "SOLDE" && statutPaiement !== "PARTIELLEMENT PAYE")) return null;
  return { codeColis, destinationCode, destinationNom, montantPaye,
    nouveauTotalPaye, nouveauSolde, statutPaiement, datePaiement };
}

function businessDateInPortoNovo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Porto-Novo",
    year: "numeric",
  }).format(new Date());
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
  paymentRequestId: string,
  authenticatedCollectionSite: string,
  internalForwarding: boolean,
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
  const operationContext = normalizeOperationContext(
    body.operationContext,
    destinationCode,
    authenticatedCollectionSite,
    internalForwarding,
  );

  if (
    !codeColis ||
    !destinationCode ||
    montantPaye === null ||
    modePaiement === null ||
    referencePaiement === null ||
    observation === null ||
    operationContext === null
  ) {
    return null;
  }

  return {
    codeColis,
    destinationCode,
    montantPaye,
    modePaiement,
    paymentRequestId,
    referencePaiement,
    observation,
    operationContext,
  };
}

function normalizeOperationContext(
  value: unknown,
  standardDestination: string | null,
  authenticatedCollectionSite: string,
  internalForwarding: boolean,
): PaymentOperationContext | null {
  if (!internalForwarding) {
    if (!standardDestination) return null;
    return { type: "STANDARD_PAYMENT", sourceDestinationCode: standardDestination, collectionSiteCode: authenticatedCollectionSite };
  }
  if (!isRecord(value)) return null;
  if (value.type === "STORAGE_DESTINATION_PAYMENT") {
    const source = normalizePaymentDestination(value.sourceDestinationCode);
    const collection = normalizePaymentDestination(value.collectionSiteCode);
    const canonicalWeightKg = normalizeAmount(value.canonicalWeightKg);
    const canonicalExpectedAmount = normalizeAmount(value.canonicalExpectedAmount);
    const canonicalTotalPaid = normalizeNonNegativeAmount(value.canonicalTotalPaid);
    if (!source || !collection || source !== collection || collection !== authenticatedCollectionSite || canonicalWeightKg === null || canonicalExpectedAmount === null || canonicalTotalPaid === null || canonicalTotalPaid >= canonicalExpectedAmount) return null;
    return { type: "STORAGE_DESTINATION_PAYMENT", sourceDestinationCode: source, collectionSiteCode: collection, canonicalWeightKg, canonicalExpectedAmount, canonicalTotalPaid };
  }
  if (value.type !== "INTER_AGENCY_FORWARDING") return null;
  const source = normalizePaymentDestination(value.sourceDestinationCode);
  const collection = normalizePaymentDestination(value.collectionSiteCode);
  const destination = normalizePaymentDestination(value.forwardingDestinationCode);
  const reference = readText(value.forwardingReference, 96)?.trim().toUpperCase() ?? null;
  if (!source || !collection || !destination || !reference || collection !== authenticatedCollectionSite || destination !== authenticatedCollectionSite || source === destination || !/^[A-Z0-9][A-Z0-9._/-]{5,95}$/.test(reference)) return null;
  return { type: "INTER_AGENCY_FORWARDING", sourceDestinationCode: source, collectionSiteCode: collection, forwardingDestinationCode: destination, forwardingReference: reference };
}

async function verifyInternalOrchestration(request: Request, body: Record<string, unknown>) {
  const timestamp = request.headers.get("x-ebe-orchestration-timestamp") ?? "";
  const signature = request.headers.get("x-ebe-orchestration-signature") ?? "";
  const key = Deno.env.get("PAYMENTS_ORCHESTRATION_HMAC_SECRET")?.trim() ?? "";
  const parsedTimestamp = Number(timestamp);
  if (!key || !/^[0-9a-f]{64}$/i.test(signature) || !Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp) > 300_000) return false;
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(`${timestamp}.${JSON.stringify(body)}`));
  const expectedHex = Array.from(new Uint8Array(expected)).map((value) => value.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expectedHex, signature.toLowerCase());
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function normalizePaymentRequestId(value: unknown): string | null {
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

function normalizeNonNegativeAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && Math.round(value * 100) === value * 100 ? value : null;
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

  return {
    code,
    status: configuration.status,
    message: configuration.defaultMessage,
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
