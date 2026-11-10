import { authenticatedRead, AuthenticatedRequestError, type BrowserAuth } from "@/features/auth/authenticated-fetch";

const PROBE_URL = "/api/admin/transferts/oidc-read-check";

export type AdminOidcProbeState =
  | "READ_METADATA_OK"
  | "ACCESS_DENIED"
  | "DISABLED"
  | "SERVICE_UNAVAILABLE";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** One diagnostic request only, even when authenticatedRead would normally retry. */
export async function requestAdminOidcProbe(
  auth: BrowserAuth,
  fetcher: Fetcher = fetch
): Promise<AdminOidcProbeState> {
  let attempted = false;
  let firstResponse: Response | null = null;
  const once: Fetcher = async (input, init) => {
    if (attempted) {
      if (firstResponse) return firstResponse.clone();
      throw new Error("PROBE_ALREADY_ATTEMPTED");
    }
    attempted = true;
    const response = await fetcher(input, init);
    firstResponse = response.clone();
    return response;
  };

  try {
    const response = await authenticatedRead(auth, PROBE_URL, {}, once);
    if (response.status === 401 || response.status === 403) return "ACCESS_DENIED";
    if (response.status === 404) return "DISABLED";
    if (response.status !== 200) return "SERVICE_UNAVAILABLE";
    const body: unknown = await response.json().catch(() => null);
    return typeof body === "object" && body !== null && "state" in body &&
      body.state === "READ_METADATA_OK" ? "READ_METADATA_OK" : "SERVICE_UNAVAILABLE";
  } catch (error) {
    return error instanceof AuthenticatedRequestError && error.status === 401
      ? "ACCESS_DENIED" : "SERVICE_UNAVAILABLE";
  }
}
