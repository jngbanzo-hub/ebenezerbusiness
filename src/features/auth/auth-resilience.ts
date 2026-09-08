export const AUTH_OPERATION_TIMEOUT_MS = 12_000;

export class AuthOperationTimeoutError extends Error {
  readonly operation: string;
  constructor(operation: string) {
    super("Le service d’authentification est temporairement indisponible. Réessayez dans quelques instants.");
    this.name = "AuthOperationTimeoutError";
    this.operation = operation;
  }
}

const inFlightAuthOperations = new Map<string, Promise<unknown>>();

export async function withinAuthTimeout<T>(operation: string, promise: PromiseLike<T>, timeoutMs = AUTH_OPERATION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AuthOperationTimeoutError(operation)), timeoutMs); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Keeps one underlying Auth request active per operation. A caller may stop
 * waiting after the UI timeout, but a retry joins the original request until
 * it settles instead of starting a concurrent Supabase Auth request.
 */
export function runSerializedAuthOperation<T>(
  operation: string,
  request: () => PromiseLike<T>,
  timeoutMs = AUTH_OPERATION_TIMEOUT_MS
): Promise<T> {
  let active = inFlightAuthOperations.get(operation) as Promise<T> | undefined;
  if (!active) {
    active = Promise.resolve().then(request);
    inFlightAuthOperations.set(operation, active);
    void active.finally(() => {
      if (inFlightAuthOperations.get(operation) === active) {
        inFlightAuthOperations.delete(operation);
      }
    }).catch(() => undefined);
  }
  return withinAuthTimeout(operation, active, timeoutMs);
}

export function loginErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  if (code === "invalid_credentials" || status === 400 && /invalid login credentials/i.test(error instanceof Error ? error.message : "")) {
    return "Adresse e-mail ou mot de passe incorrect.";
  }
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
    return "Trop de tentatives. Veuillez patienter quelques instants avant de réessayer.";
  }
  return "Le service d’authentification est temporairement indisponible. Réessayez dans quelques instants.";
}

export function isRetryableAuthError(error: unknown) {
  if (error instanceof AuthOperationTimeoutError || error instanceof TypeError) return true;
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  return status === 502 || status === 503 || status === 504;
}

export function accessVerificationErrorMessage() {
  return "Impossible de vérifier votre accès pour le moment. Réessayez.";
}

export function isDefinitiveRefreshFailure(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  return status === 400 || code === "refresh_token_not_found" || code === "refresh_token_already_used";
}
