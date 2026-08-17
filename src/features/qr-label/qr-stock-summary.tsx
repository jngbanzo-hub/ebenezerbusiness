"use client";

import { useCallback, useEffect, useState } from "react";

import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { getQrStockAlert } from "@/features/qr-label/qr-stock-alert";
import type { QrStockSummary } from "@/server/qr-stock-summary";

export function QrStockSummaryCards({ endpoint, refreshKey = 0 }: { endpoint: string; refreshKey?: number }) {
  const [summary, setSummary] = useState<QrStockSummary | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await authenticatedRead(getSupabaseBrowserClient().auth, endpoint);
      setSummary(await readJsonOrThrow<QrStockSummary>(response, "Stock QR indisponible."));
      setError("");
    } catch {
      setError("Stock QR indisponible.");
    }
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    const load = async () => { if (active) await refresh(); };
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [refresh, refreshKey]);

  const alert = summary ? getQrStockAlert(summary.unassigned) : null;

  return <section className="rounded-xl border border-white/15 bg-white/5 p-4" aria-label="Stock global des QR">
    <h2 className="text-lg font-semibold">Stock QR</h2>
    <p className="mt-1 text-xs text-muted-foreground">Registre Supabase en lecture seule.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p> : null}
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[["QR libres", summary?.unassigned], ["QR associés", summary?.assigned], ["QR révoqués", summary?.revoked], ["Total QR", summary?.total]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-white/10 bg-ebe-night/70 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-bold text-white">{value ?? "—"}</dd></div>)}
    </dl>
    {alert ? <div role="status" className={`mt-4 rounded-lg border p-4 ${alert.level === "VERY_LOW" ? "border-red-300/40 bg-red-500/15 text-red-50" : "border-amber-300/40 bg-amber-400/10 text-amber-50"}`}>
      <p className="font-bold">{alert.title}</p>
      <p className="mt-1 text-sm">{alert.message}</p>
    </div> : null}
  </section>;
}
