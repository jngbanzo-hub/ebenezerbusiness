export const QR_RESOLVER_INACTIVE_MESSAGE =
  "QR lu avec succès. Le service d’association QR n’est pas encore activé. Utilisez la recherche manuelle pour le moment.";

export type EncaissementQrResolution = Readonly<{
  agency: "FIH" | "LSHI" | "KLZ";
  trackingCode: string;
}>;

export type ResolveQrForEncaissement = (
  qrId: string
) => Promise<EncaissementQrResolution>;

const EEB_QR_ID = /^EEBQR\d{6}$/i;

export function extractEebQrId(rawValue: string): string | null {
  const value = rawValue.trim();
  if (EEB_QR_ID.test(value)) return value.toUpperCase();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const candidates = [
    ...url.pathname.split("/"),
    ...Array.from(url.searchParams.values()),
    url.hash.replace(/^#/, "")
  ];
  const qrId = candidates.find((candidate) => EEB_QR_ID.test(candidate.trim()));
  return qrId ? qrId.trim().toUpperCase() : null;
}
