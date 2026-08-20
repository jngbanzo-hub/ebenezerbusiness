"use client";

import Link from "next/link";
import { ArrowLeft, BellRing, CheckCircle2, LoaderCircle, QrCode, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Container, GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { QrBatchAssociation } from "@/features/agent/qr-batch-association";
import { QrAssignmentHistory } from "@/features/agent/qr-assignment-history";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { QrStockSummaryCards } from "@/features/qr-label/qr-stock-summary";
import {
  createQrAssignmentRequestId,
  loadManifestQrCandidates,
  messageForQrError,
  resolveQrById,
  resolveQrCandidate,
  submitQrAssociation,
  type ManifestQrCandidate,
  type QrAgency,
  type QrCandidate
} from "@/features/agent/qr-association-client";

type Profile = { agence: "COTONOU" | QrAgency; site: "COO" | QrAgency };
const AGENCIES: QrAgency[] = ["FIH", "LSHI", "KLZ"];

export function QrAssociationPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayNumber, setDisplayNumber] = useState("");
  const [agency, setAgency] = useState<QrAgency>("FIH");
  const [trackingCode, setTrackingCode] = useState("");
  const [candidate, setCandidate] = useState<QrCandidate | null>(null);
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usedQr, setUsedQr] = useState<QrCandidate | null>(null);
  const [success, setSuccess] = useState<QrCandidate | null>(null);
  const [mode, setMode] = useState<"simple" | "batch">("simple");
  const [manifestCandidates, setManifestCandidates] = useState<ManifestQrCandidate[]>([]);
  const [manifestBusy, setManifestBusy] = useState(false);
  const [manifestError, setManifestError] = useState("");
  const [manifestOpen, setManifestOpen] = useState(false);
  const [batchInput, setBatchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<QrCandidate | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [qrDataRevision, setQrDataRevision] = useState(0);

  async function refreshManifestCandidates() {
    setManifestBusy(true);
    setManifestError("");
    try {
      const result = await loadManifestQrCandidates(getSupabaseBrowserClient().auth);
      setManifestCandidates(result.candidates);
    } catch (cause) {
      setManifestError(cause instanceof Error ? cause.message : "Lecture des nouveaux QR impossible.");
    } finally {
      setManifestBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const response = await authenticatedRead(supabase.auth, "/api/agent/profile");
        const value = await readJsonOrThrow<Profile>(response, "Profil Agent indisponible.");
        setProfile(value);
        if (value.site !== "COO") setAgency(value.site);
        if (value.site === "COO") await refreshManifestCandidates();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Profil Agent indisponible.");
      }
    })();
  }, []);

  function invalidate() {
    setCandidate(null);
    setRequestId("");
    setSuccess(null);
    setError("");
    setUsedQr(null);
  }

  async function handlePrevalidate(event: FormEvent) {
    event.preventDefault();
    invalidate();
    const number = Number(displayNumber);
    const code = trackingCode.trim().toUpperCase();
    if (!/^[1-9][0-9]{0,14}$/.test(displayNumber.trim())) {
      setError("Le numéro QR est invalide.");
      return;
    }
    if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code)) {
      setError("Le code colis est invalide.");
      return;
    }
    setBusy(true);
    try {
      const resolved = await resolveQrCandidate(getSupabaseBrowserClient().auth, number);
      if (resolved.status !== "UNASSIGNED") {
        if (resolved.status === "ASSIGNED") setUsedQr(resolved);
        else setError("Ce QR est révoqué.");
        return;
      }
      setTrackingCode(code);
      setCandidate(resolved);
      setRequestId(createQrAssignmentRequestId());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Prévalidation QR impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!candidate || !requestId) return;
    setBusy(true);
    setError("");
    try {
      await submitQrAssociation(getSupabaseBrowserClient().auth, {
        displayNumber: candidate.displayNumber,
        agency,
        trackingCode,
        expectedVersion: candidate.version,
        requestId
      });
      const refreshed = await resolveQrCandidate(
        getSupabaseBrowserClient().auth,
        candidate.displayNumber
      );
      setCandidate(null);
      setSuccess(refreshed);
      setQrDataRevision((value) => value + 1);
      await refreshManifestCandidates();
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause
        ? String(cause.code)
        : "REQUEST_FAILED";
      setError(cause instanceof Error ? cause.message : messageForQrError(code));
    } finally {
      setBusy(false);
    }
  }

  const agencyLocked = profile?.site !== "COO";
  const readyManifestCandidates = manifestCandidates.filter((line) => line.ready);

  function loadCandidatesIntoBatch() {
    setBatchInput(readyManifestCandidates
      .map((line) => `${line.displayNumber} | ${line.agency} | ${line.trackingCode}`)
      .join("\n"));
    setMode("batch");
    setManifestOpen(false);
  }

  async function handleQrSearch(event: FormEvent) {
    event.preventDefault();
    const query = searchQuery.trim().toUpperCase();
    setSearchResult(null);
    setSearchError("");
    if (!query) {
      setSearchError("Saisissez un numéro QR ou un qrId.");
      return;
    }
    setSearchBusy(true);
    try {
      const resolved = /^EEBQR[0-9]{6,}$/.test(query)
        ? await resolveQrById(getSupabaseBrowserClient().auth, query)
        : /^[0-9]+$/.test(query) && Number(query) > 0
          ? await resolveQrCandidate(getSupabaseBrowserClient().auth, Number(query))
          : null;
      if (!resolved) setSearchError("QR inconnu/non reconnu.");
      else setSearchResult(resolved);
    } catch {
      setSearchError("QR inconnu/non reconnu.");
    } finally {
      setSearchBusy(false);
    }
  }

  if (profile && profile.site !== "COO") {
    return (
      <main className="grid min-h-screen place-items-center bg-ebe-night px-4 text-white">
        <GlassPanel className="w-full max-w-lg p-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-amber-200" />
          <h1 className="mt-4 text-xl font-semibold">Opération réservée à COO</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            L’association initiale d’un QR est une opération d’origine disponible uniquement à Cotonou.
          </p>
          <Button asChild variant="outline" className="mt-6"><Link href="/agent">Retour à l’Espace Agent</Link></Button>
        </GlassPanel>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12">
      <Container className="max-w-3xl">
        <Link href="/agent" className="inline-flex items-center gap-2 text-sm text-accent">
          <ArrowLeft className="h-4 w-4" />Retour au tableau de bord Agent
        </Link>
        <header className="mt-5">
          <div className="flex items-center gap-3"><QrCode className="h-8 w-8 text-accent"/><h1 className="text-3xl font-semibold">Associer un QR</h1></div>
          <p className="mt-2 text-sm text-muted-foreground">Association par numéro visible, sans paiement ni opération de stockage.</p>
        </header>

        <GlassPanel className="mt-7 p-6" glow="growth">
          {profile?.site === "COO" ? <div className="mb-6"><QrStockSummaryCards endpoint="/api/agent/qr/stock-summary" refreshKey={qrDataRevision} /></div> : null}
          <section className="mb-6 rounded-xl border border-white/15 bg-white/5 p-4" aria-label="Rechercher un QR">
            <h2 className="text-lg font-semibold">Rechercher un QR</h2>
            <p className="mt-1 text-xs text-muted-foreground">Consultation du registre QR en lecture seule.</p>
            <form onSubmit={handleQrSearch} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="qr-quick-search">Numéro visible ou qrId</label>
              <input id="qr-quick-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="013 ou EEBQR000013" className="h-11 flex-1 rounded-md border border-white/15 bg-ebe-night px-3 text-white placeholder:text-muted-foreground" disabled={searchBusy}/>
              <Button type="submit" variant="outline" disabled={searchBusy}>
                {searchBusy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : null}Rechercher
              </Button>
            </form>
            {searchError ? <p role="alert" className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-sm text-muted-foreground">{searchError}</p> : null}
            {searchResult ? <section className="mt-4 rounded-lg border border-accent/25 bg-ebe-night/70 p-4" aria-label="Résultat de la recherche QR">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold">QR {String(searchResult.displayNumber).padStart(3, "0")}</h3>
                <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold">{searchResult.status}</span>
              </div>
              <p className="mt-1 font-mono text-sm text-muted-foreground">{searchResult.qrId}</p>
              {searchResult.status === "ASSIGNED" ? <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Destination</dt><dd className="font-semibold">{searchResult.agency ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Code colis</dt><dd className="font-semibold">{searchResult.trackingCode ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Version</dt><dd className="font-semibold">{searchResult.version}</dd></div>
              </dl> : searchResult.status === "UNASSIGNED"
                ? <p className="mt-4 font-bold text-accent">QR LIBRE — AUCUN COLIS ASSOCIÉ</p>
                : <p className="mt-4 font-bold text-amber-200">QR RÉVOQUÉ — NON UTILISABLE</p>}
            </section> : null}
          </section>
          <section className="mb-6 rounded-xl border border-accent/25 bg-accent/10 p-4" aria-label="Nouveaux QR détectés dans le MANIFESTE">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 font-semibold"><BellRing className="h-4 w-4 text-accent"/>Nouveaux QR à associer ({readyManifestCandidates.length})</p>
                <p className="mt-1 text-xs text-muted-foreground">Lecture seule de la colonne H des feuilles FIH, LSHI et KLZ.</p>
              </div>
              <Button type="button" variant="outline" disabled={manifestBusy} onClick={() => setManifestOpen((value) => !value)}>
                {manifestBusy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : null}
                {manifestOpen ? "Masquer" : "Voir les lignes"}
              </Button>
            </div>
            {manifestError ? <p role="alert" className="mt-3 text-sm text-amber-200">{manifestError}</p> : null}
            {manifestOpen ? <div className="mt-4 space-y-4">
              {readyManifestCandidates.length ? <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-white/5 text-muted-foreground"><tr><th className="p-3">Date</th><th>QR visible</th><th>Destination</th><th>Code colis</th><th>État QR</th><th>Prévalidation</th></tr></thead>
                  <tbody>{readyManifestCandidates.map((line) => <tr key={`${line.agency}:${line.rowNumber}`} className="border-t border-white/10">
                    <td className="p-3">{line.date || "—"}</td><td>{line.displayNumber || line.qrNumber}</td><td>{line.agency}</td><td>{line.trackingCode || "—"}</td><td>{line.qrStatus === "ASSIGNED" ? <span className="font-bold text-red-100">QR DÉJÀ UTILISÉ<br/><span className="font-normal">{line.currentAgency ?? "—"} · {line.currentTrackingCode ?? "—"}</span></span> : line.qrStatus ?? "—"}</td><td className={line.ready ? "text-accent" : "text-amber-200"}>{MANIFEST_RESULT_LABELS[line.result] ?? line.result}</td>
                  </tr>)}</tbody>
                </table>
              </div> : <p className="text-sm text-muted-foreground">Aucun nouveau QR prêt à associer.</p>}
              <Button type="button" variant="growth" className="w-full" disabled={!readyManifestCandidates.length} onClick={loadCandidatesIntoBatch}>Charger dans Association en série</Button>
            </div> : null}
          </section>
          <nav className="mb-6 grid grid-cols-2 gap-3" aria-label="Mode d’association QR">
            <Button type="button" variant={mode === "simple" ? "growth" : "outline"} onClick={() => setMode("simple")} aria-pressed={mode === "simple"}>Mode simple</Button>
            <Button type="button" variant={mode === "batch" ? "growth" : "outline"} onClick={() => setMode("batch")} aria-pressed={mode === "batch"}>Association en série</Button>
          </nav>

          {mode === "simple" ? <>
          <form onSubmit={handlePrevalidate} className="space-y-5">
            <label className="block text-sm">Numéro QR visible
              <input value={displayNumber} onChange={(e) => { setDisplayNumber(e.target.value.replace(/^0+/, "")); invalidate(); }} inputMode="numeric" placeholder="013" className="mt-2 h-11 w-full rounded-md border border-white/15 bg-ebe-night px-3 text-white placeholder:text-muted-foreground disabled:opacity-70" disabled={busy}/>
            </label>
            <label className="block text-sm">Agence
              <select value={agency} onChange={(e) => { setAgency(e.target.value as QrAgency); invalidate(); }} disabled={busy || agencyLocked} className="mt-2 h-11 w-full rounded-md border border-white/15 bg-ebe-night px-3 text-white disabled:opacity-70">
                {AGENCIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              {agencyLocked && <span className="mt-1 block text-xs text-muted-foreground">Agence de votre profil, non modifiable.</span>}
            </label>
            <label className="block text-sm">Code colis
              <input value={trackingCode} onChange={(e) => { setTrackingCode(e.target.value.toUpperCase()); invalidate(); }} placeholder="AT09426" className="mt-2 h-11 w-full rounded-md border border-white/15 bg-ebe-night px-3 text-white placeholder:text-muted-foreground disabled:opacity-70" disabled={busy}/>
            </label>
            <Button type="submit" variant="growth" disabled={busy || !profile} className="w-full">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <ShieldCheck className="h-4 w-4"/>}Prévalider
            </Button>
          </form>

          {error && <p role="alert" className="mt-5 rounded-md border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}

          {usedQr && (
            <section role="alert" className="mt-5 rounded-xl border-2 border-red-300 bg-red-500/20 p-5 text-red-50 shadow-lg shadow-red-950/30">
              <h2 className="text-xl font-black tracking-wide">QR DÉJÀ UTILISÉ</h2>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-red-100/75">QR</dt><dd className="font-bold">{String(usedQr.displayNumber).padStart(3, "0")}</dd></div>
                <div><dt className="text-red-100/75">qrId</dt><dd className="font-bold">{usedQr.qrId}</dd></div>
                <div><dt className="text-red-100/75">Destination actuelle</dt><dd className="font-bold">{usedQr.agency ?? "—"}</dd></div>
                <div><dt className="text-red-100/75">Code colis actuel</dt><dd className="font-bold">{usedQr.trackingCode ?? "—"}</dd></div>
              </dl>
            </section>
          )}

          {candidate && (
            <section className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5" aria-label="Confirmation de l’association">
              <h2 className="text-xl font-semibold">Vous allez associer :</h2>
              <p className="mt-3 text-lg font-semibold text-accent">QR {String(candidate.displayNumber).padStart(3, "0")} → {agency} + {trackingCode}</p>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">qrId officiel</dt><dd>{candidate.qrId}</dd></div>
                <div><dt className="text-muted-foreground">État actuel</dt><dd>{candidate.status}</dd></div>
                <div><dt className="text-muted-foreground">Version</dt><dd>{candidate.version}</dd></div>
                <div><dt className="text-muted-foreground">Déjà associé</dt><dd>NON</dd></div>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">Le code sera certifié dans le MANIFESTE officiel par le serveur au moment de la confirmation.</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="growth" onClick={handleConfirm} disabled={busy}>Confirmer l’association</Button>
                <Button type="button" variant="outline" onClick={invalidate} disabled={busy}>Annuler</Button>
              </div>
            </section>
          )}

          {success && (
            <section className="mt-6 rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-5" role="status">
              <div className="flex items-center gap-2 text-emerald-100"><CheckCircle2 className="h-5 w-5"/><h2 className="font-semibold">QR associé avec succès</h2></div>
              <p className="mt-3">QR {String(success.displayNumber).padStart(3, "0")} — {success.agency} + {success.trackingCode}</p>
            </section>
          )}
          </> : <QrBatchAssociation initialInput={batchInput} onAssignmentsCompleted={() => { setQrDataRevision((value) => value + 1); void refreshManifestCandidates(); }} />}
          {profile?.site === "COO" ? <QrAssignmentHistory refreshKey={qrDataRevision} /> : null}
        </GlassPanel>
      </Container>
    </main>
  );
}

const MANIFEST_RESULT_LABELS: Record<string, string> = {
  READY: "PRÊT",
  MISSING_DATE: "DATE MANQUANTE",
  MISSING_TRACKING_CODE: "CODE COLIS MANQUANT",
  INVALID_QR_NUMBER: "NUMÉRO QR INVALIDE",
  QR_UNKNOWN: "QR INCONNU",
  QR_ALREADY_ASSIGNED: "QR DÉJÀ UTILISÉ",
  QR_REVOKED: "QR RÉVOQUÉ",
  PARCEL_ALREADY_ASSIGNED: "COLIS DÉJÀ ASSOCIÉ",
  DUPLICATE_QR_IN_MANIFEST: "QR EN DOUBLON DANS LE MANIFESTE",
  DUPLICATE_PARCEL_IN_MANIFEST: "COLIS EN DOUBLON DANS LE MANIFESTE"
};
