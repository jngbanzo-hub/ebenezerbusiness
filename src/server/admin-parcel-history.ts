import "server-only";

import type { AdminGlobalParcelSearchResult } from "@/server/admin-global-parcel-search";
import { searchAdminParcelGlobally } from "@/server/admin-global-parcel-search";
import { determineParcelConsistency } from "@/server/admin-parcel-consistency";

export type ParcelHistoryEvent = { id: string; occurredAt: string | null; type: string; source: "MANIFESTE" | "EXPÉDITION" | "STOCKAGE V2" | "ENCAISSEMENTS" | "QR"; agency: string; groupage: string | null; detail: string; status: string };
export type AdminParcelHistory = {
  code: string; found: boolean;
  current: { destination: string | null; weightKg: number | null; status: string | null; qr: string | null; payment: string | null; storage: string | null; lastActivity: string | null };
  datedEvents: ParcelHistoryEvent[]; undatedEvents: ParcelHistoryEvent[];
  consistency: "COHERENT" | "MULTIPLE_MANIFEST_MATCHES" | "INCONSISTENT";
  manifestMatches: { count: number; details: string[] };
  inconsistencies: string[];
  sources: Record<"manifest" | "shipments" | "storage" | "payments" | "qr", { state: "FOUND" | "ABSENT" | "UNAVAILABLE_TEMPORARILY" }>;
};

export async function readAdminParcelHistory(actorId: string, code: string) {
  return buildAdminParcelHistory(await searchAdminParcelGlobally(actorId, code));
}

export function buildAdminParcelHistory(result: AdminGlobalParcelSearchResult): AdminParcelHistory {
  const events: ParcelHistoryEvent[] = [];
  result.manifest.matches.forEach((item) => events.push({ id: `manifest-${item.agency}-${item.rowNumber}`, occurredAt: reliableDate(item.date), type: "ENREGISTREMENT MANIFESTE", source: "MANIFESTE", agency: item.agency, groupage: null, detail: `Poids : ${item.weightKg ?? "—"} kg · Ligne ${item.rowNumber}`, status: item.status }));
  result.shipments.matches.forEach((item) => events.push({ id: `shipment-${item.id}`, occurredAt: reliableDate(item.date), type: "EXPÉDITION", source: "EXPÉDITION", agency: item.agency, groupage: item.groupage || null, detail: `Groupage : ${item.groupage || "Non renseigné"} · Compagnie : ${item.company || "—"} · Destination : ${item.destination}`, status: item.status || "—" }));
  result.qr.matches.forEach((item) => {
    if (item.audit.length) item.audit.forEach((audit, index) => events.push({ id: `qr-${item.qrId}-${index}`, occurredAt: reliableDate(audit.occurredAt), type: qrAction(audit.action), source: "QR", agency: item.agency ?? "—", groupage: null, detail: `QR ${String(item.displayNumber).padStart(3, "0")} · ${item.qrId}`, status: item.status }));
    else events.push({ id: `qr-${item.qrId}`, occurredAt: reliableDate(item.assignedAt), type: "QR ASSOCIÉ", source: "QR", agency: item.agency ?? "—", groupage: null, detail: `QR ${String(item.displayNumber).padStart(3, "0")} · ${item.qrId}`, status: item.status });
  });
  result.storage.matches.forEach((item, parcelIndex) => {
    events.push({ id: `storage-entry-${parcelIndex}-${item.agency}`, occurredAt: reliableDate(item.createdAt), type: "ENTRÉE EN STOCK", source: "STOCKAGE V2", agency: item.agency, groupage: null, detail: `Poids : ${item.weightKg} kg`, status: item.status });
    item.events.forEach((event, index) => events.push({ id: `storage-event-${parcelIndex}-${index}`, occurredAt: reliableDate(event.occurredAt), type: storageEventLabel(event.type), source: "STOCKAGE V2", agency: item.agency, groupage: null, detail: event.type, status: item.status }));
  });
  result.payments.matches.forEach((item, index) => events.push({ id: `payment-${item.id || index}`, occurredAt: reliableDate(item.dateTime), type: "PAIEMENT ENREGISTRÉ", source: "ENCAISSEMENTS", agency: item.agenceEncaissement, groupage: null, detail: `Attendu : ${item.montantAttendu ?? "—"} · Payé : ${item.montantPaye} · ${item.modePaiement || "Mode —"}${item.reference ? ` · Réf. ${item.reference}` : ""}`, status: item.statutPaiement }));

  const datedEvents = events.filter((event) => event.occurredAt).sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
  const undatedEvents = events.filter((event) => !event.occurredAt);
  const qr = result.qr.matches[0]; const storage = result.storage.matches[0]; const payment = newestPayment(result.payments.matches);
  const manifestAgencies = new Set(result.manifest.matches.map((item) => item.agency));
  const manifest = manifestAgencies.size === 1 ? newestManifest(result.manifest.matches) : undefined;
  const consistency = determineParcelConsistency({ manifest: result.manifest.matches, qr: result.qr.matches, storage: result.storage.matches });
  return {
    code: result.code, found: result.found,
    current: { destination: qr?.agency ?? manifest?.agency ?? storage?.agency ?? null, weightKg: manifest?.weightKg ?? storage?.weightKg ?? null, status: manifest?.status ?? storage?.status ?? null, qr: qr ? String(qr.displayNumber).padStart(3, "0") : null, payment: payment?.statutPaiement ?? null, storage: storage?.status ?? null, lastActivity: datedEvents.at(-1)?.occurredAt ?? null },
    datedEvents, undatedEvents, consistency: consistency.state, manifestMatches: { count: consistency.manifestMatchCount, details: consistency.manifestDetails }, inconsistencies: consistency.inconsistencies,
    sources: { manifest: { state: result.manifest.state }, shipments: { state: result.shipments.state }, storage: { state: result.storage.state }, payments: { state: result.payments.state }, qr: { state: result.qr.state } }
  };
}

function reliableDate(value: unknown) { const text = String(value ?? "").trim(); return text && !Number.isNaN(Date.parse(text)) ? text : null; }
function newestPayment<T extends { dateTime: string }>(items: T[]) { return [...items].sort((a,b)=>String(b.dateTime).localeCompare(String(a.dateTime)))[0]; }
function newestManifest<T extends { date: string }>(items: T[]) { return [...items].sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]; }
function qrAction(action: string) { return action === "INITIAL_ASSIGNMENT" ? "QR ASSOCIÉ" : action === "ADMIN_CORRECTION" ? "QR CORRIGÉ" : action === "ADMIN_REVOCATION" ? "QR RÉVOQUÉ" : action; }
function storageEventLabel(type: string) { const value = type.toUpperCase(); if (value.includes("SORTIE")) return "SORTIE DU STOCK"; if (value.includes("ENTREE") || value.includes("ARRIVAL")) return "ENTRÉE EN STOCK"; return "MOUVEMENT DE STOCK"; }
