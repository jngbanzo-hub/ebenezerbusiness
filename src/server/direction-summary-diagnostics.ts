export const DIRECTION_SOURCE_TIMEOUT_MS = 4_500;
export const DIRECTION_EXPENSES_TODAY_TIMEOUT_MS = 6_000;
export const DIRECTION_SOURCES = ["CAISSE", "DEPENSES", "STOCK", "BENEFICE"] as const;
export type DirectionSource = (typeof DIRECTION_SOURCES)[number];

export type DirectionSourceDiagnostic = Readonly<{
  source: DirectionSource;
  event: "START" | "SUCCESS" | "FAILURE";
  startedAt: string;
  durationMs?: number;
  timeout: boolean;
  errorType?: string;
  httpStatus?: number;
  postgresCode?: string;
  message?: string;
}>;

export class DirectionSourceTimeoutError extends Error {
  constructor() {
    super("SOURCE_TIMEOUT");
    this.name = "DirectionSourceTimeoutError";
  }
}

type Logger = (event: DirectionSourceDiagnostic) => void;

export async function observeDirectionSource<T>(
  source: DirectionSource,
  reader: () => Promise<T>,
  options: { timeoutMs?: number; now?: () => Date; logger?: Logger } = {}
): Promise<T | null> {
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? logDirectionSource;
  const started = now();
  const startedAt = started.toISOString();
  logger({ source, event: "START", startedAt, timeout: false });
  try {
    const value = await withDirectionTimeout(reader(), options.timeoutMs ?? DIRECTION_SOURCE_TIMEOUT_MS);
    logger({ source, event: "SUCCESS", startedAt, durationMs: elapsedMs(started, now()), timeout: false });
    return value;
  } catch (error) {
    const timeout = error instanceof DirectionSourceTimeoutError;
    const details = classifyDirectionSourceError(error);
    logger({ source, event: "FAILURE", startedAt, durationMs: elapsedMs(started, now()), timeout, ...details });
    return null;
  }
}

export async function withDirectionTimeout<T>(promise: Promise<T>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DirectionSourceTimeoutError()), milliseconds); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function classifyDirectionSourceError(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const code = stringValue(record.code) ?? stringValue(record.errorCode) ?? stringValue(record.statusCode);
  const httpStatus = numberValue(record.httpStatus) ?? numberValue(record.status);
  const postgresCode = stringValue(record.postgresCode) ?? (code && /^PGRST|^\d{5}$/.test(code) ? code : undefined);
  const normalized = `${code ?? ""} ${message}`.toUpperCase();
  const errorType = error instanceof DirectionSourceTimeoutError || normalized.includes("TIMEOUT")
    ? "TIMEOUT"
    : httpStatus === 401 || normalized.includes("UNAUTHORIZED")
      ? "401"
      : httpStatus === 403 || normalized.includes("FORBIDDEN") || normalized.includes("RLS") || normalized.includes("PERMISSION DENIED")
        ? "403/SUPABASE_RLS"
        : normalized.includes("NOT_CONFIGURED") || normalized.includes("VARIABLE") || normalized.includes("MISSING")
          ? "VARIABLE_ABSENTE"
          : normalized.includes("APPS_SCRIPT") || normalized.includes("DÉPENSES") || normalized.includes("DEPENSES")
            ? "APPS_SCRIPT"
            : normalized.includes("GOOGLE") || normalized.includes("SHEET") || normalized.includes("BILAN_SOURCE")
              ? "GOOGLE_SHEETS"
              : normalized.includes("CONTRACT_INVALID") || normalized.includes("INVALID_RESPONSE") || normalized.includes("RÉPONSE") || normalized.includes("REPONSE")
                ? "REPONSE_INVALIDE"
                : error instanceof TypeError || normalized.includes("FETCH") || normalized.includes("NETWORK")
                  ? "RESEAU"
                  : normalized.includes("BUSINESS") || normalized.includes("MÉTIER") || normalized.includes("METIER")
                    ? "ERREUR_METIER"
                    : "ERREUR_INATTENDUE";
  return {
    errorType,
    httpStatus,
    postgresCode,
    message: safeDiagnosticMessage(message)
  };
}

export function logDirectionSource(event: DirectionSourceDiagnostic) {
  console.info("[direction-summary] source_read", JSON.stringify(event));
}

function elapsedMs(started: Date, ended: Date) { return Math.max(0, ended.getTime() - started.getTime()); }
function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : undefined; }
function numberValue(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? value : undefined; }
function safeDiagnosticMessage(value: string) {
  return value.replace(/bearer\s+\S+/gi, "Bearer [REDACTED]").replace(/(?:token|secret|password|api[_-]?key)\s*[=:]\s*\S+/gi, "[CREDENTIAL_REDACTED]").replace(/https?:\/\/\S+/gi, "[URL_REDACTED]").slice(0, 240);
}
