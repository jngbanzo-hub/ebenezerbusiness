import { createHash, timingSafeEqual } from "node:crypto";

export type DeploymentAttestationResult = "CORRESPOND" | "NE_CORRESPOND_PAS" | "INDETERMINABLE";
type Authorization =
  | { authorized: true; role: "ADMIN"; userId: string }
  | { authorized: false; status: 401 | 403 };

type Options = {
  enabled: boolean;
  vercelEnvironment: string | undefined;
  expiresAt: string | undefined;
  configuredUrl: string | undefined;
  authorize: (request: Request) => Promise<Authorization>;
  now?: () => number;
};

const MAX_WINDOW_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 256;
const DIGEST = /^[a-f0-9]{64}$/;
const DEPLOYMENT_PATH = /^\/macros\/s\/([A-Za-z0-9_-]{20,512})\/exec$/;

function result(value: DeploymentAttestationResult, status = 200): Response {
  return new Response(JSON.stringify({ result: value }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function hidden(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

function deploymentDigest(configuredUrl: string | undefined): Buffer | null {
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl.trim());
    if (url.protocol !== "https:" || url.hostname !== "script.google.com" ||
        url.username || url.password || url.search || url.hash || url.port) return null;
    const match = DEPLOYMENT_PATH.exec(url.pathname);
    return match ? createHash("sha256").update(match[1], "utf8").digest() : null;
  } catch {
    return null;
  }
}

async function readSmallBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    return null;
  }
}

export async function attestAdminTransferDeployment(request: Request, options: Options): Promise<Response> {
  const now = options.now?.() ?? Date.now();
  const remaining = Date.parse(options.expiresAt ?? "") - now;
  if (!options.enabled || options.vercelEnvironment !== "production" ||
      !Number.isFinite(remaining) || remaining <= 0 || remaining > MAX_WINDOW_MS) return hidden();

  try {
    const auth = await options.authorize(request);
    if (!auth.authorized) return result("INDETERMINABLE", auth.status);
    if (auth.role !== "ADMIN") return result("INDETERMINABLE", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return result("INDETERMINABLE", 400);
    const raw = await readSmallBody(request);
    if (raw === null) return result("INDETERMINABLE", 400);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return result("INDETERMINABLE", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !("candidateDigest" in body) ||
        typeof body.candidateDigest !== "string" || !DIGEST.test(body.candidateDigest))
      return result("INDETERMINABLE", 400);
    const actual = deploymentDigest(options.configuredUrl);
    if (!actual) return result("INDETERMINABLE", 503);
    const candidate = Buffer.from(body.candidateDigest, "hex");
    return result(timingSafeEqual(actual, candidate) ? "CORRESPOND" : "NE_CORRESPOND_PAS");
  } catch {
    return result("INDETERMINABLE", 503);
  }
}
