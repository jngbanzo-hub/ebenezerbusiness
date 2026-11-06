/** B1 preparation only. This module is not part of the deployed application. */

export const SHEETS_READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const STS_SCOPE = "https://www.googleapis.com/auth/iam";
const EXPECTED_ISSUER = "https://oidc.vercel.com/ebenezerbusiness";
const EXPECTED_AUDIENCE = "https://vercel.com/ebenezerbusiness";
const EXPECTED_SUBJECT = "owner:ebenezerbusiness:project:ebenezerbusiness:environment:production";

export type ProbeConfig = {
  providerAudience: string;
  serviceAccountEmail: string;
  spreadsheetId: string;
};

export type ProbeResult = {
  state: "READ_METADATA_OK";
  oidcExchange: true;
  temporaryGoogleToken: true;
  transfersTab: true;
  auditTab: true;
  requestedSheetsScope: typeof SHEETS_READ_SCOPE;
  writePermission: "NOT_TESTED";
};

export class ProbeUnavailable extends Error {
  constructor() { super("PROBE_UNAVAILABLE"); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateConfig(config: ProbeConfig): void {
  if (!/^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[A-Za-z0-9_-]+\/providers\/[A-Za-z0-9_-]+$/.test(config.providerAudience) ||
      config.serviceAccountEmail !== "transfers-admin-code-reader@eben-ezer-business.iam.gserviceaccount.com" ||
      !/^[A-Za-z0-9_-]{20,}$/.test(config.spreadsheetId)) {
    throw new ProbeUnavailable();
  }
}

function validateVercelToken(token: string, now = Date.now()): void {
  try {
    if (token.length > 16_384) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => !part)) throw new Error();
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!isRecord(claims) || claims.iss !== EXPECTED_ISSUER ||
        claims.aud !== EXPECTED_AUDIENCE || claims.sub !== EXPECTED_SUBJECT ||
        !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.nbf) ||
        !Number.isSafeInteger(claims.exp)) throw new Error();
    const issuedAt = claims.iat as number;
    const notBefore = claims.nbf as number;
    const expires = claims.exp as number;
    const seconds = Math.floor(now / 1000);
    if (expires <= seconds + 15 || notBefore > seconds + 60 || issuedAt > seconds + 60 ||
        expires - issuedAt > 3600 || expires <= issuedAt) throw new Error();
  } catch {
    throw new ProbeUnavailable();
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new ProbeUnavailable();
  try {
    const value: unknown = await response.json();
    if (isRecord(value)) return value;
  } catch { /* Do not expose upstream response bodies. */ }
  throw new ProbeUnavailable();
}

/** Only Google STS verifies the JWT signature; local claim checks are an early rejection. */
export async function runAdminTransferOidcProbe(
  token: string,
  config: ProbeConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now()
): Promise<ProbeResult> {
  validateConfig(config);
  validateVercelToken(token, now);
  try {
    const sts = await readJson(await fetcher("https://sts.googleapis.com/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
        audience: config.providerAudience,
        scope: STS_SCOPE,
        requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
        subjectToken: token,
        subjectTokenType: "urn:ietf:params:oauth:token-type:jwt"
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    }));
    if (typeof sts.access_token !== "string" || !sts.access_token ||
        sts.token_type !== "Bearer" || typeof sts.expires_in !== "number" ||
        sts.expires_in <= 0 || sts.expires_in > 3600) throw new ProbeUnavailable();

    const iam = await readJson(await fetcher(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(config.serviceAccountEmail)}:generateAccessToken`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${sts.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ scope: [SHEETS_READ_SCOPE], lifetime: "300s" }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000)
      }
    ));
    const expiresAt = typeof iam.expireTime === "string" ? Date.parse(iam.expireTime) : NaN;
    if (typeof iam.accessToken !== "string" || !iam.accessToken ||
        !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 360_000) {
      throw new ProbeUnavailable();
    }

    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}`);
    url.searchParams.set("fields", "spreadsheetId,sheets(properties(title))");
    const sheet = await readJson(await fetcher(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${iam.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    }));
    if (sheet.spreadsheetId !== config.spreadsheetId || !Array.isArray(sheet.sheets)) {
      throw new ProbeUnavailable();
    }
    const titles = sheet.sheets.map((item: unknown) =>
      isRecord(item) && isRecord(item.properties) ? item.properties.title : null);
    if (titles.filter((title) => title === "TRANSFERTS").length !== 1 ||
        titles.filter((title) => title === "AUDIT").length !== 1) {
      throw new ProbeUnavailable();
    }
    return {
      state: "READ_METADATA_OK", oidcExchange: true, temporaryGoogleToken: true,
      transfersTab: true, auditTab: true, requestedSheetsScope: SHEETS_READ_SCOPE,
      writePermission: "NOT_TESTED"
    };
  } catch {
    throw new ProbeUnavailable();
  }
}

type ProbeAuthorization = { authorized: true } | { authorized: false; status: 401 | 403 };
type ProbeHandlerDependencies = {
  enabled: boolean;
  expiresAt: string | undefined;
  vercelEnvironment: string | undefined;
  config: ProbeConfig;
  authorize: (request: Request) => Promise<ProbeAuthorization>;
  run?: typeof runAdminTransferOidcProbe;
};

/** A separate, default-off route handler; no transfer-operation dependency. */
export async function handleAdminTransferOidcProbeRequest(
  request: Request,
  dependencies: ProbeHandlerDependencies
): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  if (!dependencies.enabled) {
    return Response.json({ state: "DISABLED" }, { status: 404, headers });
  }
  const expiry = Date.parse(dependencies.expiresAt ?? "");
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry - Date.now() > 900_000) {
    return Response.json({ state: "DISABLED" }, { status: 404, headers });
  }
  try {
    const admin = await dependencies.authorize(request);
    if (!admin.authorized) {
      return Response.json({ state: "FORBIDDEN" }, { status: admin.status, headers });
    }
    if (dependencies.vercelEnvironment !== "production") {
      return Response.json({ state: "SERVICE_UNAVAILABLE" }, { status: 503, headers });
    }
    const result = await (dependencies.run ?? runAdminTransferOidcProbe)(
      request.headers.get("x-vercel-oidc-token") ?? "", dependencies.config
    );
    return Response.json(result, { headers });
  } catch {
    return Response.json({ state: "SERVICE_UNAVAILABLE" }, { status: 503, headers });
  }
}
