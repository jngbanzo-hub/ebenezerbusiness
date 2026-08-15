import "server-only";

export type QrAgency = "FIH" | "LSHI" | "KLZ";

export type CertifiedQrParcelIdentity = {
  agency: QrAgency;
  trackingCode: string;
};

export class QrIdentityCertificationError extends Error {
  constructor(
    readonly code: "IDENTITY_NOT_FOUND" | "IDENTITY_SERVICE_UNAVAILABLE",
    readonly status: 404 | 503
  ) {
    super(code);
    this.name = "QrIdentityCertificationError";
  }
}

type Fetcher = typeof fetch;

export async function certifyQrParcelIdentity(
  input: CertifiedQrParcelIdentity,
  bearerToken: string,
  fetcher: Fetcher = fetch
): Promise<CertifiedQrParcelIdentity> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl || !bearerToken) {
    throw new QrIdentityCertificationError("IDENTITY_SERVICE_UNAVAILABLE", 503);
  }

  let response: Response;
  try {
    response = await fetcher(
      `${supabaseUrl}/functions/v1/paiements-agents-rechercher-colis`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          destinationCode: input.agency,
          codeColis: input.trackingCode
        }),
        cache: "no-store"
      }
    );
  } catch {
    throw new QrIdentityCertificationError("IDENTITY_SERVICE_UNAVAILABLE", 503);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 404) {
    throw new QrIdentityCertificationError("IDENTITY_NOT_FOUND", 404);
  }
  if (!response.ok || !isRecord(payload)) {
    throw new QrIdentityCertificationError("IDENTITY_SERVICE_UNAVAILABLE", 503);
  }

  const candidate = extractParcel(payload);
  const returnedAgency = readText(candidate?.destinationCode)?.toUpperCase();
  const returnedCode = readText(candidate?.codeColis)?.toUpperCase();
  if (returnedAgency !== input.agency || returnedCode !== input.trackingCode) {
    throw new QrIdentityCertificationError("IDENTITY_SERVICE_UNAVAILABLE", 503);
  }

  // The financial and personal projection returned by the legacy reader is
  // deliberately discarded. Only the canonical identity crosses this boundary.
  return { agency: input.agency, trackingCode: input.trackingCode };
}

function extractParcel(value: Record<string, unknown>) {
  const candidate = value.data ?? value.result ?? value.colis ?? value;
  return isRecord(candidate) ? candidate : null;
}

function readText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
