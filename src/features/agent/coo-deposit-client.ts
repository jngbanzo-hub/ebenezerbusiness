export type CooDepositAgentProfile = Readonly<{
  role: "AGENT";
  agence: string;
  site: string;
}>;

export type CooDepositCommand = Readonly<{
  trackingCode: string;
  requestId: string;
  confirmationPhysicalDeposit: true;
}>;

export type CooDepositSuccess = Readonly<{
  state: "SUCCESS";
  replayed: boolean;
  eventId: string;
  trackingCode: string;
  version: 1;
  agency: "COO";
}>;

export class CooDepositRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string
  ) {
    super(message);
    this.name = "CooDepositRequestError";
    this.code = code;
    this.status = status;
  }
}

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export function canAccessCooDepositAction(profile: CooDepositAgentProfile) {
  return (
    profile.role === "AGENT" &&
    profile.agence.trim().toUpperCase() === "COTONOU" &&
    profile.site.trim().toUpperCase() === "COO"
  );
}

export async function submitCooDeposit(
  accessToken: string,
  command: CooDepositCommand,
  fetcher: Fetcher = fetch
): Promise<CooDepositSuccess> {
  if (!accessToken.trim()) {
    throw new CooDepositRequestError(
      "UNAUTHORIZED",
      401,
      "Votre session Agent a expiré."
    );
  }

  const response = await fetcher("/api/agent/logistics/entry-coo", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  const payload: unknown = await response.json().catch(() => null);

  if (response.ok && isCooDepositSuccess(payload)) {
    return payload;
  }

  const remoteError = readRemoteError(payload);
  throw new CooDepositRequestError(
    remoteError.code,
    response.status,
    remoteError.message
  );
}

function isCooDepositSuccess(value: unknown): value is CooDepositSuccess {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const result = value as Record<string, unknown>;
  return (
    result.state === "SUCCESS" &&
    typeof result.replayed === "boolean" &&
    typeof result.eventId === "string" &&
    typeof result.trackingCode === "string" &&
    result.version === 1 &&
    result.agency === "COO"
  );
}

function readRemoteError(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      code: "SERVICE_UNAVAILABLE",
      message: "Le service logistique est indisponible."
    };
  }
  const error = (value as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return {
      code: "SERVICE_UNAVAILABLE",
      message: "Le service logistique est indisponible."
    };
  }
  const fields = error as Record<string, unknown>;
  return {
    code:
      typeof fields.code === "string" ? fields.code : "SERVICE_UNAVAILABLE",
    message:
      typeof fields.message === "string"
        ? fields.message
        : "Le service logistique est indisponible."
  };
}
