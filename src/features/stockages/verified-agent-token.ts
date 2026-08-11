type Session = Readonly<{ access_token?: string }> | null;

type AgentAuth = Readonly<{
  getSession: () => Promise<{ data: { session: Session } }>;
  getUser: (jwt: string) => Promise<{ data: { user: unknown | null }; error: unknown | null }>;
  refreshSession: () => Promise<{ data: { session: Session }; error: unknown | null }>;
}>;

export async function getVerifiedAgentWriteToken(auth: AgentAuth): Promise<string> {
  const { data: { session } } = await auth.getSession();
  const currentToken = session?.access_token;
  if (!currentToken) throw new Error("Session expirée.");

  const currentUser = await auth.getUser(currentToken);
  if (!currentUser.error && currentUser.data.user) return currentToken;

  const refreshed = await auth.refreshSession();
  const refreshedToken = refreshed.data.session?.access_token;
  if (refreshed.error || !refreshedToken) throw new Error("Session expirée.");

  const refreshedUser = await auth.getUser(refreshedToken);
  if (refreshedUser.error || !refreshedUser.data.user) throw new Error("Session expirée.");
  return refreshedToken;
}
