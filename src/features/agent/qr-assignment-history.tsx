"use client";

import { useCallback, useEffect, useState } from "react";

import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { QrAssignmentHistoryItem } from "@/server/qr-assignment-history";

export function QrAssignmentHistory({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<QrAssignmentHistoryItem[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await authenticatedRead(getSupabaseBrowserClient().auth, "/api/agent/qr/assignment-history");
      const value = await readJsonOrThrow<{ assignments: QrAssignmentHistoryItem[] }>(response, "Historique QR indisponible.");
      setItems(value.assignments);
      setError("");
    } catch {
      setError("Historique QR indisponible.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  return <section className="mt-6 rounded-xl border border-white/15 bg-white/5 p-4" aria-label="Historique des QR associés">
    <h2 className="text-lg font-semibold">Associations récentes</h2>
    <p className="mt-1 text-xs text-muted-foreground">Lecture seule des associations initiales enregistrées dans le registre QR officiel.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p> : null}
    {!error && !items.length ? <p className="mt-4 text-sm text-muted-foreground">Aucune association initiale enregistrée.</p> : null}
    {items.length ? <div className="mt-4 overflow-x-auto rounded-lg border border-white/10"><table className="w-full min-w-[880px] text-left text-sm">
      <thead className="bg-white/5 text-muted-foreground"><tr><th className="p-3">QR</th><th>qrId</th><th>Destination</th><th>Code colis</th><th>Statut actuel</th><th>Associé le</th><th>Agent COO</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.eventId} className="border-t border-white/10"><td className="p-3 font-bold">{String(item.displayNumber).padStart(3, "0")}</td><td className="font-mono">{item.qrId}</td><td>{item.agency}</td><td>{item.trackingCode}</td><td>{item.status}</td><td>{new Date(item.assignedAt).toLocaleString("fr-FR")}</td><td>{item.actorName ?? `${item.actorRole} · ${item.actorId}`}</td></tr>)}</tbody>
    </table></div> : null}
  </section>;
}
