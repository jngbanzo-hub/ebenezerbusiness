"use client";

import { useEffect, useState } from "react";

import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { QrStockSummary } from "@/server/qr-stock-summary";

export function QrStockSummaryCards({ endpoint }: { endpoint: string }) {
  const [summary, setSummary] = useState<QrStockSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void authenticatedRead(getSupabaseBrowserClient().auth, endpoint)
      .then((response) => readJsonOrThrow<QrStockSummary>(response, "Stock QR indisponible."))
      .then((value) => { if (active) setSummary(value); })
      .catch(() => { if (active) setError("Stock QR indisponible."); });
    return () => { active = false; };
  }, [endpoint]);

  return <section className="rounded-xl border border-white/15 bg-white/5 p-4" aria-label="Stock global des QR">
    <h2 className="text-lg font-semibold">Stock QR</h2>
    <p className="mt-1 text-xs text-muted-foreground">Registre Supabase en lecture seule.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p> : null}
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[["QR libres", summary?.unassigned], ["QR associés", summary?.assigned], ["QR révoqués", summary?.revoked], ["Total QR", summary?.total]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-white/10 bg-ebe-night/70 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-bold text-white">{value ?? "—"}</dd></div>)}
    </dl>
  </section>;
}
