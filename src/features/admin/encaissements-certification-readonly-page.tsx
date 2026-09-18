"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Container, GlassPanel } from "@/components/design-system";
import { getAdminProfile } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

type Report = {
  targets?: Array<{ sheet: string; code: string; state: string; reasons: string[]; matches: Array<{ date: string | null; weightKg: number | null; expectedUsd: number | null; paidUsd: number | null; remainingUsd: number | null; status: string; cohort: string | null }> }>;
  p1Checks?: Record<string, { pass: boolean; totalPaidUsd: number; expectedUsd: number; byAgency: Record<string, number>; duplicatePaymentIds: number; rowCount: number; rows: Array<{ id: string; date: string; agency: string; destination: string; amount: number; paymentRequestId: string | null }>; unexpectedRows: Array<{ id: string; date: string; agency: string; destination: string; amount: number; paymentRequestId: string | null }> }>;
  aggregates?: Record<string, { certifiedExpectedUsd: number | null; certifiedPaidUsd: number | null; certifiedRemainingUsd: number | null; paidIdentityCount: number; remainingIdentityCount: number; historicalNonCertifiedCount: number; insufficientDataCount: number }>;
  conservation?: Record<string, string>;
  physicalIdentities?: { state: string; matches: Array<{ agency: string; trackingCode: string; parcelId: string | null; forwardingId: string | null; originAgency: string | null; destinationAgency: string | null; weightKg: number | null; deliveryStatus: string | null; paymentRequestId: string | null; orchestrationState: string | null }> };
  modern?: Record<string, { certifiedExpectedUsd: number; certifiedPaidUsd: number; certifiedRemainingUsd: number; paidIdentityCount: number; remainingIdentityCount: number; nonCertifiedCount: number; insufficientDataCount: number; conservation: string; debts: Array<{ code: string; cohort: string; expectedUsd: number; paidUsd: number; remainingUsd: number; beneficiary: string | null }> }>;
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
      <GlassPanel className="p-5"><h2 className="text-xl">Dossiers obligatoires</h2><div className="mt-3 grid gap-2">{(report.targets ?? []).map(target => <div key={`${target.sheet}:${target.code}`} className="rounded border border-white/10 p-3"><strong>{target.sheet} · {target.code}</strong><span className="ml-3">{target.state}</span>{target.reasons.length ? <p className="text-xs text-muted-foreground">{target.reasons.join(" · ")}</p> : null}{target.matches.map((match, index) => <p key={index} className="mt-2 text-xs text-muted-foreground">{match.date ?? "date inconnue"} · F {match.expectedUsd ?? "N/C"} · M {match.paidUsd ?? "N/C"} · L {match.remainingUsd ?? "N/C"} · G {match.status || "N/C"} · cohorte {match.cohort ?? "N/C"}</p>)}</div>)}</div></GlassPanel>
      <GlassPanel className="p-5"><h2 className="text-xl">Contrôles P1</h2><div className="mt-3 grid gap-2">{Object.entries(report.p1Checks ?? {}).map(([code, item]) => <div key={code} className="rounded border border-white/10 p-3"><strong>{code}</strong><span className="ml-3">{item.pass ? "PASS" : "FAIL"}</span><p className="text-sm">{item.totalPaidUsd} USD / {item.expectedUsd} USD · lignes attendues : {item.rowCount} · doublons : {item.duplicatePaymentIds}</p><p className="text-xs text-muted-foreground">{Object.entries(item.byAgency).map(([agency, amount]) => `${agency} ${amount} USD`).join(" · ")}</p><p className="mt-2 text-xs text-muted-foreground">{item.rows.map(row => `${row.agency} ${row.date} ${row.amount} USD${row.paymentRequestId ? ` · ${row.paymentRequestId}` : ""}`).join(" | ")}</p>{item.unexpectedRows.length ? <p className="mt-2 text-xs text-amber-100">Même code hors périmètre attendu (identité agence distincte) : {item.unexpectedRows.map(row => `${row.agency} ${row.amount} USD`).join(" | ")}</p> : null}</div>)}</div></GlassPanel>
      <GlassPanel className="p-5"><h2 className="text-xl">Agrégats certifiés</h2><div className="mt-3 grid gap-2">{Object.entries(report.aggregates ?? {}).map(([agency, item]) => <div key={agency} className="rounded border border-white/10 p-3"><strong>{agency}</strong><p className="text-sm">Attendu certifié : {item.certifiedExpectedUsd === null ? "NON CALCULABLE" : `${item.certifiedExpectedUsd} USD`} · encaissé : {item.certifiedPaidUsd === null ? "NON CALCULABLE" : `${item.certifiedPaidUsd} USD`} · reste : {item.certifiedRemainingUsd === null ? "NON CALCULABLE" : `${item.certifiedRemainingUsd} USD`}</p><p className="text-xs text-muted-foreground">Payés : {item.paidIdentityCount} · Restes : {item.remainingIdentityCount} · Historiques non certifiés : {item.historicalNonCertifiedCount} · Données insuffisantes : {item.insufficientDataCount} · Conservation : {report.conservation?.[agency] ?? "NON CALCULABLE"}</p></div>)}</div></GlassPanel>
      <GlassPanel className="p-5"><h2 className="text-xl">Identité physique AT02326</h2><p className="mt-2 text-sm text-muted-foreground">Résolution read-only par parcel_id, forwarding_id, agence et orchestration ; le tracking seul n’est pas une identité suffisante.</p><div className="mt-3 grid gap-2">{report.physicalIdentities?.state !== "FOUND" ? <p className="text-amber-100">Source physique temporairement indisponible / non certifiable.</p> : report.physicalIdentities.matches.map((match, index) => <div key={`${match.agency}:${match.parcelId ?? match.forwardingId ?? index}`} className="rounded border border-white/10 p-3"><strong>{match.trackingCode} · {match.agency}</strong><p className="text-xs text-muted-foreground">Nature : {match.forwardingId ? "FORWARDING" : "NATIF"} · parcel_id : {match.parcelId ?? "NULL"} · forwarding_id : {match.forwardingId ?? "NULL"}</p><p className="text-xs text-muted-foreground">Route : {match.originAgency ?? "—"} → {match.destinationAgency ?? "—"} · poids : {match.weightKg ?? "N/C"} kg · statut : {match.deliveryStatus ?? "N/C"}</p><p className="text-xs text-muted-foreground">paymentRequestId : {match.paymentRequestId ?? "N/C"} · orchestration : {match.orchestrationState ?? "N/C"}</p></div>)}</div></GlassPanel>
      <GlassPanel className="p-5"><h2 className="text-xl">Agrégats certifiés — AT 2026 et après</h2><p className="mt-2 text-sm text-muted-foreground">Les cohortes MR à JL restent isolées ; absence P1 n’est jamais interprétée comme impayé historique.</p><div className="mt-3 grid gap-2">{Object.entries(report.modern ?? {}).map(([agency, item]) => <div key={agency} className="rounded border border-white/10 p-3"><strong>{agency}</strong><p className="text-sm">Attendu : {item.certifiedExpectedUsd} USD · encaissé : {item.certifiedPaidUsd} USD · reste : {item.certifiedRemainingUsd} USD · conservation : {item.conservation}</p><p className="text-xs text-muted-foreground">Payés : {item.paidIdentityCount} · dettes certifiées : {item.remainingIdentityCount} · non certifiés : {item.nonCertifiedCount} · données insuffisantes : {item.insufficientDataCount}</p>{item.debts.length ? <p className="mt-2 text-xs text-amber-100">Dettes certifiées : {item.debts.map(debt => `${debt.code} (${debt.remainingUsd} USD)`).join(" · ")}</p> : null}</div>)}</div></GlassPanel>
    </div> : null}
  </Container></main>;
}
