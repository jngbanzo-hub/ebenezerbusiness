type Session = Readonly<{ access_token?: string }> | null;

export type BrowserAuth = Readonly<{
  getSession: () => Promise<{ data: { session: Session } }>;
  refreshSession: () => Promise<{ data: { session: Session }; error: unknown | null }>;
}>;

export class AuthenticatedRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export async function authenticatedRead(
  auth: BrowserAuth,
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetcher: Fetcher = fetch,
  initialToken?: string
): Promise<Response> {
  const session = initialToken ? null : await auth.getSession();
  const token = initialToken ?? session?.data.session?.access_token;
  if (!token) throw new AuthenticatedRequestError("Votre session a expiré. Veuillez vous reconnecter.", 401, "SESSION_EXPIRED");

  let response: Response;
  try {
    response = await send(fetcher, input, init, token);
  } catch {
    return sendOnceAfterTransientFailure(fetcher, input, init, token);
  }

  if (response.status === 401) {
    const refreshed = await auth.refreshSession();
    const refreshedToken = refreshed.data.session?.access_token;
    if (refreshed.error || !refreshedToken) {
      throw new AuthenticatedRequestError("Votre session a expiré. Veuillez vous reconnecter.", 401, "SESSION_EXPIRED");
    }
    return send(fetcher, input, init, refreshedToken);
  }

  if (TRANSIENT_STATUSES.has(response.status)) {
    return sendOnceAfterTransientFailure(fetcher, input, init, token);
  }

  return response;
}

async function sendOnceAfterTransientFailure(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit,
  token: string
) {
  try {
    return await send(fetcher, input, init, token);
  } catch {
    throw new AuthenticatedRequestError(
      "Le service rencontre un problème temporaire. Réessayez dans quelques instants.",
      503,
      "SERVICE_TEMPORARILY_UNAVAILABLE"
    );
  }
}

function send(fetcher: Fetcher, input: RequestInfo | URL, init: RequestInit, token: string) {
  return fetcher(input, {
    ...init,
    method: init.method ?? "GET",
    cache: "no-store",
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`
    }
  });
}

export async function readJsonOrThrow<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.ok) return payload as T;

  const code = typeof payload?.code === "string"
    ? payload.code
    : typeof payload?.error === "string"
      ? payload.error
      : response.status === 403
        ? "ACCESS_DENIED"
        : response.status === 401
          ? "SESSION_EXPIRED"
          : "REQUEST_FAILED";
  const message = typeof payload?.message === "string"
    ? payload.message
    : response.status === 403
      ? "Vous n’êtes pas autorisé à effectuer cette opération."
      : response.status === 401
        ? "Votre session a expiré. Veuillez vous reconnecter."
        : TRANSIENT_STATUSES.has(response.status)
          ? "Le service rencontre un problème temporaire. Réessayez dans quelques instants."
          : fallback;
  throw new AuthenticatedRequestError(message, response.status, code);
}
