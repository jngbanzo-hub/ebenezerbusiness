type Session = Readonly<{ access_token?: string }> | null;

type AgentAuth = Readonly<{
  getSession: () => Promise<{ data: { session: Session } }>;
  getUser: (jwt: string) => Promise<{ data: { user: unknown | null }; error: unknown | null }>;
  refreshSession: () => Promise<{ data: { session: Session }; error: unknown | null }>;
}>;

const WRITE_AUTH_TIMEOUT_MS = 5_000;

export class AgentWriteSessionError extends Error {
  readonly code = "SESSION_EXPIRED";

  constructor() {
    super("Votre session a expiré. Veuillez vous reconnecter.");
    this.name = "AgentWriteSessionError";
  }
}

export async function getVerifiedAgentWriteToken(auth: AgentAuth): Promise<string> {
  const deadline = Date.now() + WRITE_AUTH_TIMEOUT_MS;
  const { data: { session } } = await withinAuthDeadline(auth.getSession(), deadline);
  const currentToken = session?.access_token;
  if (!currentToken) throw new AgentWriteSessionError();

  const currentUser = await withinAuthDeadline(auth.getUser(currentToken), deadline);
  if (!currentUser.error && currentUser.data.user) return currentToken;

  const refreshed = await withinAuthDeadline(auth.refreshSession(), deadline);
  const refreshedToken = refreshed.data.session?.access_token;
  if (refreshed.error || !refreshedToken) throw new AgentWriteSessionError();

  const refreshedUser = await withinAuthDeadline(auth.getUser(refreshedToken), deadline);
  if (refreshedUser.error || !refreshedUser.data.user) throw new AgentWriteSessionError();
  return refreshedToken;
}

async function withinAuthDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new AgentWriteSessionError();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new AgentWriteSessionError()), remainingMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
