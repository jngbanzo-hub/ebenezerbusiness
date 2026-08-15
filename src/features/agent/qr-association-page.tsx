"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, LoaderCircle, QrCode, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Container, GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import {
  createQrAssignmentRequestId,
  messageForQrError,
  resolveQrCandidate,
  submitQrAssociation,
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
  const [success, setSuccess] = useState<QrCandidate | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const response = await authenticatedRead(supabase.auth, "/api/agent/profile");
        const value = await readJsonOrThrow<Profile>(response, "Profil Agent indisponible.");
        setProfile(value);
        if (value.site !== "COO") setAgency(value.site);
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
        setError(resolved.status === "REVOKED" ? "Ce QR est révoqué." : "Ce QR est déjà associé.");
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
        </GlassPanel>
      </Container>
    </main>
  );
}
