import "server-only";

import type { AdminGlobalParcelSearchResult } from "@/server/admin-global-parcel-search";
import { searchAdminParcelGlobally } from "@/server/admin-global-parcel-search";

export type ParcelHistoryEvent = { id: string; occurredAt: string | null; type: string; source: "MANIFESTE" | "STOCKAGE V2" | "ENCAISSEMENTS" | "QR"; agency: string; detail: string; status: string };
export type AdminParcelHistory = {
  code: string; found: boolean;
  current: { destination: string | null; weightKg: number | null; status: string | null; qr: string | null; payment: string | null; storage: string | null; lastActivity: string | null };
  datedEvents: ParcelHistoryEvent[]; undatedEvents: ParcelHistoryEvent[];
  inconsistencies: string[];
  sources: Record<"manifest" | "storage" | "payments" | "qr", { state: "FOUND" | "ABSENT" | "UNAVAILABLE_TEMPORARILY" }>;
};

export async function readAdminParcelHistory(actorId: string, code: string) {
  return buildAdminParcelHistory(await searchAdminParcelGlobally(actorId, code));
}

export function buildAdminParcelHistory(result: AdminGlobalParcelSearchResult): AdminParcelHistory {
  const events: ParcelHistoryEvent[] = [];
  result.manifest.matches.forEach((item) => events.push({ id: `manifest-${item.agency}-${item.rowNumber}`, occurredAt: reliableDate(item.date), type: "ENREGISTREMENT MANIFESTE", source: "MANIFESTE", agency: item.agency, detail: `Poids : ${item.weightKg ?? "—"} kg · Ligne ${item.rowNumber}`, status: item.status }));
  result.qr.matches.forEach((item) => {
    if (item.audit.length) item.audit.forEach((audit, index) => events.push({ id: `qr-${item.qrId}-${index}`, occurredAt: reliableDate(audit.occurredAt), type: qrAction(audit.action), source: "QR", agency: item.agency ?? "—", detail: `QR ${String(item.displayNumber).padStart(3, "0")} · ${item.qrId}`, status: item.status }));
    else events.push({ id: `qr-${item.qrId}`, occurredAt: reliableDate(item.assignedAt), type: "QR ASSOCIÉ", source: "QR", agency: item.agency ?? "—", detail: `QR ${String(item.displayNumber).padStart(3, "0")} · ${item.qrId}`, status: item.status });
  });
  result.storage.matches.forEach((item, parcelIndex) => {
    events.push({ id: `storage-entry-${parcelIndex}-${item.agency}`, occurredAt: reliableDate(item.createdAt), type: "ENTRÉE EN STOCK", source: "STOCKAGE V2", agency: item.agency, detail: `Poids : ${item.weightKg} kg`, status: item.status });
    item.events.forEach((event, index) => events.push({ id: `storage-event-${parcelIndex}-${index}`, occurredAt: reliableDate(event.occurredAt), type: storageEventLabel(event.type), source: "STOCKAGE V2", agency: item.agency, detail: event.type, status: item.status }));
  });
  result.payments.matches.forEach((item, index) => events.push({ id: `payment-${item.id || index}`, occurredAt: reliableDate(item.dateTime), type: "PAIEMENT ENREGISTRÉ", source: "ENCAISSEMENTS", agency: item.agenceEncaissement, detail: `Attendu : ${item.montantAttendu ?? "—"} · Payé : ${item.montantPaye} · ${item.modePaiement || "Mode —"}${item.reference ? ` · Réf. ${item.reference}` : ""}`, status: item.statutPaiement }));

  const datedEvents = events.filter((event) => event.occurredAt).sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
  const undatedEvents = events.filter((event) => !event.occurredAt);
  const qr = result.qr.matches[0]; const storage = result.storage.matches[0]; const payment = newestPayment(result.payments.matches); const manifest = newestManifest(result.manifest.matches);
  const agencies = new Set([...result.manifest.matches.map((item) => item.agency), ...result.storage.matches.map((item) => item.agency), ...result.payments.matches.map((item) => item.agenceEncaissement), ...result.qr.matches.map((item) => item.agency).filter(Boolean) as string[]]);
  const inconsistencies = agencies.size > 1 ? [`Destinations/agences observées : ${Array.from(agencies).join(", ")}.`] : [];
  return {
    code: result.code, found: result.found,
    current: { destination: qr?.agency ?? manifest?.agency ?? storage?.agency ?? null, weightKg: manifest?.weightKg ?? storage?.weightKg ?? null, status: manifest?.status ?? storage?.status ?? null, qr: qr ? String(qr.displayNumber).padStart(3, "0") : null, payment: payment?.statutPaiement ?? null, storage: storage?.status ?? null, lastActivity: datedEvents.at(-1)?.occurredAt ?? null },
    datedEvents, undatedEvents, inconsistencies,
    sources: { manifest: { state: result.manifest.state }, storage: { state: result.storage.state }, payments: { state: result.payments.state }, qr: { state: result.qr.state } }
  };
}

function reliableDate(value: unknown) { const text = String(value ?? "").trim(); return text && !Number.isNaN(Date.parse(text)) ? text : null; }
function newestPayment<T extends { dateTime: string }>(items: T[]) { return [...items].sort((a,b)=>String(b.dateTime).localeCompare(String(a.dateTime)))[0]; }
function newestManifest<T extends { date: string }>(items: T[]) { return [...items].sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]; }
function qrAction(action: string) { return action === "INITIAL_ASSIGNMENT" ? "QR ASSOCIÉ" : action === "ADMIN_CORRECTION" ? "QR CORRIGÉ" : action === "ADMIN_REVOCATION" ? "QR RÉVOQUÉ" : action; }
function storageEventLabel(type: string) { const value = type.toUpperCase(); if (value.includes("SORTIE")) return "SORTIE DU STOCK"; if (value.includes("ENTREE") || value.includes("ARRIVAL")) return "ENTRÉE EN STOCK"; return "MOUVEMENT DE STOCK"; }
