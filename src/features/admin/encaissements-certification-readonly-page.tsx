"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Container, GlassPanel } from "@/components/design-system";
import { getAdminProfile } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

type Report = {
  targets?: Array<{ sheet: string; code: string; state: string; reasons: string[]; matches: unknown[] }>;
  p1Checks?: Record<string, { pass: boolean; totalPaidUsd: number; expectedUsd: number; byAgency: Record<string, number>; duplicatePaymentIds: number }>;
  aggregates?: Record<string, { certifiedExpectedUsd: number; certifiedPaidUsd: number; certifiedRemainingUsd: number; paidIdentityCount: number; remainingIdentityCount: number; historicalNonCertifiedCount: number; insufficientDataCount: number }>;
  conservation?: Record<string, string>;
};

export function EncaissementsCertificationReadonlyPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("Lecture read-only en cours…");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
        if (!session?.user || !session.access_token) throw new Error("Session Admin requise.");
        await getAdminProfile(session.user);
        const response = await fetch("/api/admin/encaissements-certification-readonly", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const payload = await response.json() as Report & { message?: string };
        if (!response.ok) throw new Error(payload.message ?? "Certification indisponible.");
        if (active) { setReport(payload); setMessage(""); }
      } catch (cause) {
        if (active) setMessage(cause instanceof Error ? cause.message : "Certification indisponible.");
      }
    })();
    return () => { active = false; };
  }, []);

  return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container>
    <Link href="/admin" className="text-accent">← Retour à l’Administration</Link>
    <h1 className="mt-4 text-3xl font-semibold">Certification encaissements — façade temporaire</h1>
    <p className="mt-2 text-sm text-muted-foreground">Lecture Admin read-only des preuves G/L/M et des contrôles P1. Aucune donnée métier n’est modifiée.</p>
    {message ? <p role="status" className="mt-5 text-amber-100">{message}</p> : null}
    {report ? <div className="mt-6 grid gap-5">
      <GlassPanel className="p-5"><h2 className="text-xl">Dossiers obligatoires</h2><div className="mt-3 grid gap-2">{(report.targets ?? []).map(target => <div key={`${target.sheet}:${target.code}`} className="rounded border border-white/10 p-3"><strong>{target.sheet} · {target.code}</strong><span className="ml-3">{target.state}</span>{target.reasons.length ? <p className="text-xs text-muted-foreground">{target.reasons.join(" · ")}</p> : null}</div>)}</div></GlassPanel>
      <GlassPanel className="p-5"><h2 className="text-xl">Contrôles P1</h2><div className="mt-3 grid gap-2">{Object.entries(report.p1Checks ?? {}).map(([code, item]) => <div key={code} className="rounded border border-white/10 p-3"><strong>{code}</strong><span className="ml-3">{item.pass ? "PASS" : "FAIL"}</span><p className="text-sm">{item.totalPaidUsd} USD / {item.expectedUsd} USD · doublons : {item.duplicatePaymentIds}</p></div>)}</div></GlassPanel>
      <GlassPanel className="p-5"><h2 className="text-xl">Agrégats certifiés</h2><div className="mt-3 grid gap-2">{Object.entries(report.aggregates ?? {}).map(([agency, item]) => <div key={agency} className="rounded border border-white/10 p-3"><strong>{agency}</strong><p className="text-sm">Attendu certifié : {item.certifiedExpectedUsd} USD · encaissé : {item.certifiedPaidUsd} USD · reste : {item.certifiedRemainingUsd} USD</p><p className="text-xs text-muted-foreground">Payés : {item.paidIdentityCount} · Restes : {item.remainingIdentityCount} · Historiques non certifiés : {item.historicalNonCertifiedCount} · Données insuffisantes : {item.insufficientDataCount} · Conservation : {report.conservation?.[agency] ?? "NON CALCULABLE"}</p></div>)}</div></GlassPanel>
    </div> : null}
  </Container></main>;
}
