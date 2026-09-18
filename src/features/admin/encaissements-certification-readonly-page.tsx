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
  p1ModernAudit?: Record<string, { rowCount: number; grossExpectedUsd: number; grossPaidUsd: number; grossRemainingUsd: number; settledCount: number; partialCount: number; otherStatusCount: number; certifiedRowCount: number; certifiedPaidUsd: number; nonReconciledCount: number; nonReconciledAmountUsd: number; excludedCount: number; excludedAmountUsd: number; ambiguousCount: number; ambiguousAmountUsd: number; lineConservation: string; amountConservation: string; exclusionReasons: Record<string, { count: number; amount: number; examples: string[] }>; diagnosticRows?: DiagnosticRow[] }>;
};

type DiagnosticRow = { code: string; date: string | null; weightKg: number | null; expectedUsd: number | null; paidUsd: number; remainingUsd: number | null; status: string; paymentAgency: string; destination: string; cohort: string | null; manifestSheet: string; manifestCode: string | null; manifestMatches: number; manifestDate: string | null; result: string; reason: string | null; firstFail: string | null; pipeline: Record<string, string>; manifestF: unknown; manifestFType: string | null; manifestFState: string | null; manifestM: unknown; manifestMType: string | null; manifestMPresent: boolean; manifestG: unknown; manifestL: unknown };

type DiagnosticWithAgency = DiagnosticRow & { agency: string };

function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/[^0-9,.-]/g, "").replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRaw(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && !value.trim()) ? "N/C" : String(value);
}

function buildDiagnostics(report: Report): DiagnosticWithAgency[] {
  return Object.entries(report.p1ModernAudit ?? {}).flatMap(([agency, item]) => (item.diagnosticRows ?? []).map(row => ({ ...row, agency })));
}

function buildP1Totals(report: Report) {
  const totals = new Map<string, { total: number; agencies: string[]; ids: Set<string> }>();
  for (const [code, item] of Object.entries(report.p1Checks ?? {})) for (const row of [...item.rows, ...item.unexpectedRows]) {
    const key = `${code}:${row.agency}`;
    const existing = totals.get(key) ?? { total: 0, agencies: [], ids: new Set<string>() };
    if (!existing.ids.has(row.id)) { existing.total += row.amount; existing.ids.add(row.id); }
    if (!existing.agencies.includes(row.agency)) existing.agencies.push(row.agency);
    totals.set(key, existing);
  }
  return totals;
}

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

  const diagnostics = report ? buildDiagnostics(report) : [];
  const p1Totals = report ? buildP1Totals(report) : new Map<string, { total: number; agencies: string[]; ids: Set<string> }>();
  const diagnosticsByAgency = Object.fromEntries(["FIH", "LSHI", "KLZ"].map(agency => {
    const rows = diagnostics.filter(row => row.agency === agency);
    const states = ["F_POSITIF", "F_ZERO", "F_VIDE", "F_NULL", "F_NON_NUMERIQUE"] as const;
    const zeroRows = rows.filter(row => row.manifestFState === "F_ZERO");
    const zeroWithM = zeroRows.filter(row => row.manifestMPresent);
    const zeroMZero = zeroRows.filter(row => parseMoney(row.manifestM) === 0);
    const zeroMAbsent = zeroRows.filter(row => !row.manifestMPresent);
    const withP1 = zeroRows.map(row => ({ row, p1: p1Totals.get(`${row.code}:${row.paymentAgency}`) })).filter(item => item.p1 && item.p1.total > 0);
    const concordant = withP1.filter(item => parseMoney(item.row.manifestM) !== null && Math.abs((parseMoney(item.row.manifestM) ?? 0) - (item.p1?.total ?? 0)) < 0.005);
    const different = withP1.filter(item => parseMoney(item.row.manifestM) !== null && Math.abs((parseMoney(item.row.manifestM) ?? 0) - (item.p1?.total ?? 0)) >= 0.005);
    return [agency, { rows, states, zeroRows, zeroWithM, zeroMZero, zeroMAbsent, withP1, concordant, different }];
  }));

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
      <GlassPanel className="p-5"><h2 className="text-xl">Audit brut P1 — AT 2026 et après</h2><p className="mt-2 text-sm text-muted-foreground">Détail read-only du pipeline de rapprochement. Aucune source métier n’est modifiée.</p><div className="mt-3 grid gap-2">{Object.entries(report.p1ModernAudit ?? {}).map(([agency, item]) => <div key={agency} className="rounded border border-white/10 p-3"><strong>{agency}</strong><p className="text-sm">Lignes : {item.rowCount} · attendu brut : {item.grossExpectedUsd} USD · payé brut : {item.grossPaidUsd} USD · reste brut : {item.grossRemainingUsd} USD</p><p className="text-xs text-muted-foreground">SOLDÉ : {item.settledCount} · PARTIEL : {item.partialCount} · autres : {item.otherStatusCount}</p><p className="text-xs text-muted-foreground">Certifiées : {item.certifiedRowCount} ({item.certifiedPaidUsd} USD) · non rapprochées : {item.nonReconciledCount} ({item.nonReconciledAmountUsd} USD) · ambiguës : {item.ambiguousCount} ({item.ambiguousAmountUsd} USD)</p><p className="text-xs text-muted-foreground">Conservation lignes : {item.lineConservation} · montants : {item.amountConservation}</p><p className="mt-2 text-xs text-amber-100">Motifs : {Object.entries(item.exclusionReasons).map(([reason, detail]) => `${reason} ${detail.count} lignes/${detail.amount} USD [${detail.examples.join(", ")}]`).join(" · ") || "Aucun"}</p><details className="mt-3"><summary className="cursor-pointer text-sm text-accent">Afficher les lignes et le pipeline ({item.diagnosticRows?.length ?? 0})</summary><div className="mt-2 max-h-[32rem] overflow-auto space-y-2">{(item.diagnosticRows ?? []).map((row, index) => <div key={`${row.code}:${row.date}:${index}`} className="rounded border border-white/10 p-2 text-xs"><p><strong>{row.code}</strong> · {row.date ?? "date N/C"} · {row.paidUsd} USD · {row.result} · premier échec : {row.firstFail ?? "aucun"}</p><p className="text-muted-foreground">P1 {row.paymentAgency} → destination {row.destination} · cohorte {row.cohort ?? "N/C"} · feuille {row.manifestSheet} · code recherché {row.manifestCode ?? "N/C"} · correspondances {row.manifestMatches}</p><p className="text-muted-foreground">motif : {row.reason ?? "CERTIFIÉ"} · manifeste {row.manifestDate ?? "N/C"}</p><p className="text-muted-foreground">pipeline : {Object.entries(row.pipeline).map(([step, state]) => `${step}=${state}`).join(" → ")}</p></div>)}</div></details></div>)}</div></GlassPanel>
      <GlassPanel className="p-5"><h2 className="text-xl">Diagnostic F/M — lecture seule</h2><p className="mt-2 text-sm text-muted-foreground">Agrégation des champs bruts déjà retournés par le serveur. Aucun montant financier n’est recalculé.</p><div className="mt-3 grid gap-3">{Object.entries(diagnosticsByAgency).map(([agency, data]) => <div key={agency} className="rounded border border-white/10 p-3"><strong>{agency}</strong><p className="text-xs text-muted-foreground">{data.states.map(state => `${state} : ${data.rows.filter(row => row.manifestFState === state).length}`).join(" · ")}</p><p className="text-xs text-muted-foreground">F_ZERO + M renseigné : {data.zeroWithM.length} · M=0 : {data.zeroMZero.length} · M absent : {data.zeroMAbsent.length} · P1 trouvé : {data.withP1.length} · M/P1 concordants : {data.concordant.length} · différents : {data.different.length}</p><details className="mt-2"><summary className="cursor-pointer text-sm text-accent">Voir les cas F=0 ({data.zeroRows.length})</summary><div className="mt-2 max-h-[28rem] overflow-auto space-y-2">{data.zeroRows.map((row, index) => { const p1 = p1Totals.get(`${row.code}:${row.paymentAgency}`); const m = parseMoney(row.manifestM); const comparison = !row.manifestMPresent || m === null || !p1 ? "NON COMPARABLE" : Math.abs(m - p1.total) < 0.005 ? "PASS" : "FAIL"; return <div key={`${row.code}:${row.date}:${index}`} className="rounded border border-white/10 p-2 text-xs"><p><strong>{row.code}</strong> · destination {row.destination} · cohorte {row.cohort ?? "N/C"} · poids {row.weightKg ?? "N/C"} kg</p><p>F : {formatRaw(row.manifestF)} ({row.manifestFType ?? "N/C"}) · M : {formatRaw(row.manifestM)} ({row.manifestMType ?? "N/C"}) · G : {formatRaw(row.manifestG)} · L : {formatRaw(row.manifestL)}</p><p>P1 : {p1 ? `${p1.total} USD · ${p1.agencies.join("/")}` : "N/C"} · concordance M/P1 : {comparison}</p></div>; })}</div></details></div>)}</div></GlassPanel>
      <GlassPanel className="p-5"><h2 className="text-xl">Témoins F/M/P1</h2><div className="mt-3 grid gap-2">{["AT30126", "AT14526", "AT18826", "AT02326"].map(code => { const rows = diagnostics.filter(row => row.code === code); const p1 = Object.entries(report.p1Checks ?? {}).find(([key]) => key === code)?.[1]; return <div key={code} className="rounded border border-white/10 p-3"><strong>{code}</strong>{rows.length ? rows.map((row, index) => { const total = p1 ? p1.totalPaidUsd : null; return <p key={index} className="text-xs text-muted-foreground">Destination {row.destination} · cohorte {row.cohort ?? "N/C"} · F {formatRaw(row.manifestF)} · état {row.manifestFState ?? "N/C"} · M {formatRaw(row.manifestM)} · total P1 {total === null ? "N/C" : `${total} USD`} · concordance {total === null || parseMoney(row.manifestM) === null ? "NON COMPARABLE" : Math.abs((parseMoney(row.manifestM) ?? 0) - total) < 0.005 ? "PASS" : "FAIL"}</p>; }) : <p className="text-xs text-muted-foreground">F/M non présent dans les lignes diagnostics actuelles · contrôle P1 {p1 ? `${p1.totalPaidUsd} USD — ${p1.pass ? "PASS" : "FAIL"}` : "N/C"}</p>}</div>; })}</div></GlassPanel>
    </div> : null}
  </Container></main>;
}
