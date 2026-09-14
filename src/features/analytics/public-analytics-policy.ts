export type PublicAnalyticsEvent = {
  type: "pageview" | "event";
  url: string;
};

export type TrackingSearchOutcome = "success" | "not_found" | "unavailable";
export type QrAnalyticsSource = "integrated" | "external";
export type QrResolutionOutcome = "success" | "invalid" | "unknown";

const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/contact",
  "/live",
  "/privacy",
  "/services",
  "/suivi-de-colis",
  "/tarifs"
]);

function normalizePathname(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export function isExternalQrPath(pathname: string) {
  return /^\/q\/[^/]+\/?$/.test(pathname);
}

export function isPublicAnalyticsPath(pathname: string | null | undefined) {
  if (!pathname) return false;
  const normalizedPathname = normalizePathname(pathname);
  return PUBLIC_EXACT_PATHS.has(normalizedPathname) || isExternalQrPath(normalizedPathname);
}

export function sanitizePublicAnalyticsEvent<T extends PublicAnalyticsEvent>(event: T): T | null {
  let url: URL;

  try {
    url = new URL(event.url, "https://www.ebenezerbusiness.com");
  } catch {
    return null;
  }

  if (!isPublicAnalyticsPath(url.pathname)) return null;
  if (!isExternalQrPath(url.pathname)) return event;

  const sanitizedPath = "/q/[qrId]";

  return {
    ...event,
    url: event.url.startsWith("http") ? `${url.origin}${sanitizedPath}` : sanitizedPath
  };
}

export function trackingSearchOutcome(status: number, found: boolean): TrackingSearchOutcome {
  if (found && status >= 200 && status < 300) return "success";
  if (status === 404) return "not_found";
  return "unavailable";
}

export function qrResolutionOutcome(state: string): QrResolutionOutcome {
  if (state === "ASSIGNED") return "success";
  if (state === "INVALID" || state === "REVOKED") return "invalid";
  return "unknown";
}
