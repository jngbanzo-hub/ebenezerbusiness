export const AUTH_OPERATION_TIMEOUT_MS = 12_000;

export class AuthOperationTimeoutError extends Error {
  readonly operation: string;
  constructor(operation: string) {
    super("Le service d’authentification est temporairement indisponible. Réessayez dans quelques instants.");
    this.name = "AuthOperationTimeoutError";
    this.operation = operation;
  }
}

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

export function loginErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  if (code === "invalid_credentials" || status === 400 && /invalid login credentials/i.test(error instanceof Error ? error.message : "")) {
    return "Adresse e-mail ou mot de passe incorrect.";
  }
  return "Le service d’authentification est temporairement indisponible. Réessayez dans quelques instants.";
}

export function isRetryableAuthError(error: unknown) {
  if (error instanceof AuthOperationTimeoutError || error instanceof TypeError) return true;
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  return status === 502 || status === 503 || status === 504;
}
