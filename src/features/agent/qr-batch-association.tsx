"use client";

import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { parseQrBatchInput } from "@/features/agent/qr-batch-parser";
import {
  createQrAssignmentRequestId,
  prevalidateQrBatch,
  submitQrBatchAssociation,
  readQrBatchStatus,
  type QrBatchResult,
  type QrAgency,
  type QrBatchPrevalidationLine
} from "@/features/agent/qr-association-client";

type FinalLine = QrBatchPrevalidationLine & {
  finalResult?: "ASSOCIÉ" | "DÉJÀ ASSOCIÉ" | "CONFLIT DE VERSION" | "ÉCHEC" | "ÉTAT À VÉRIFIER";
  requestId?: string;
  failureCode?: string;
  retrySafe?: boolean;
};

type FinalSummary = {
  associated: number;
  alreadyAssociated: number;
  errors: number;
  notProcessed: number;
};

const RESULT_LABELS: Record<string, string> = {
  READY: "PRÊT",
  INVALID_QR_NUMBER: "QR INVALIDE",
  QR_UNKNOWN: "QR INCONNU",
  QR_ALREADY_ASSIGNED: "QR DÉJÀ UTILISÉ",
  QR_REVOKED: "QR RÉVOQUÉ",
  INVALID_CODE: "CODE INTROUVABLE",
  INVALID_AGENCY: "AGENCE INVALIDE",
  PARCEL_ALREADY_ASSIGNED: "COLIS DÉJÀ ASSOCIÉ",
  DUPLICATE_IN_LIST: "DOUBLON DANS LA LISTE",
  SOURCE_UNAVAILABLE: "SOURCE INDISPONIBLE"
};

export function QrBatchAssociation({
  initialInput = "",
  onAssignmentsCompleted
}: {
  initialInput?: string;
  onAssignmentsCompleted?: () => void;
}) {
  const [input, setInput] = useState(initialInput);
  const [lines, setLines] = useState<FinalLine[]>([]);
  const [retainedResults, setRetainedResults] = useState<FinalLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [finalSummary, setFinalSummary] = useState<FinalSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const requestIds = useRef(new Map<string, string>());
  const readyCount = useMemo(() => lines.filter((line) => line.ready && !line.finalResult).length, [lines]);
  const errorCount = lines.length - readyCount;
  const displayedLines = [...retainedResults, ...lines];
  const hasUnresolvedResults = displayedLines.some(line => line.finalResult && !["ASSOCIÉ", "DÉJÀ ASSOCIÉ"].includes(line.finalResult));

  useEffect(() => {
    try { setBatchId(sessionStorage.getItem("eeb.qr.lastBatchId")); } catch { /* Storage can be disabled. */ }
  }, []);

  useEffect(() => {
    if (!initialInput) return;
    setInput(initialInput);
    invalidate();
  }, [initialInput]);

  function invalidate() {
    setLines([]);
    setRetainedResults([]);
    setConfirmed(false);
    setError("");
    setFinalSummary(null);
  }

  async function handlePrevalidate() {
    if (inFlight.current) return;
    invalidate();
    const parsed = parseQrBatchInput(input);
    if (!parsed.length) {
      setError("Ajoutez au moins une ligne au format : 014 | KLZ | AT09526");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      setLines(await prevalidateQrBatch(getSupabaseBrowserClient().auth, parsed));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Prévalidation série impossible.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (inFlight.current) return;
    const readyLines = lines.filter((line) => line.ready && line.version !== undefined);
    if (!readyLines.length || !confirmed) return;
    if (readyLines.length !== lines.length) {
      setError("Le lot contient des lignes invalides. Corrigez-les avant toute confirmation.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setConfirming(true);
    setError("");
    const next = lines.map((line) => {
      const key = `${Number(line.displayNumber)}|${line.agency}|${line.trackingCode}|${line.version}`;
      const requestId = line.requestId ?? requestIds.current.get(key) ?? createQrAssignmentRequestId();
      requestIds.current.set(key, requestId);
      return { ...line, requestId };
    });
    setLines(next);
    const currentBatchId = createQrAssignmentRequestId();
    setBatchId(currentBatchId);
    try { sessionStorage.setItem("eeb.qr.lastBatchId", currentBatchId); } catch { /* Keep the ID in component state. */ }
    try {
      const result = await submitQrBatchAssociation(
        getSupabaseBrowserClient().auth,
        next.filter((line) => line.ready && line.version !== undefined).map((line) => ({
          lineNumber: line.lineNumber,
          displayNumber: Number(line.displayNumber),
          agency: line.agency as QrAgency,
          trackingCode: line.trackingCode,
          expectedVersion: line.version!,
          requestId: line.requestId!
        })), currentBatchId
      );
      applyBatchResult(result, next);
    } catch (cause) {
      setLines(next.map(line => ({ ...line, ready: false, retrySafe: false, finalResult: "ÉTAT À VÉRIFIER" })));
      setError(cause instanceof Error ? cause.message : "Confirmation série impossible.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setConfirming(false);
      setConfirmed(false);
    }
  }

  function applyBatchResult(result: QrBatchResult, previous: FinalLine[]) {
    if (!["COMPLETED", "REJECTED"].includes(result.status)) {
      setFinalSummary(null);
      setLines(previous.map(line => ({ ...line, ready: false, retrySafe: false, finalResult: "ÉTAT À VÉRIFIER" })));
      setError("État du lot non définitif. Utilisez Vérifier le lot, sans renvoyer les associations.");
      return;
    }
    setLines(result.lines.map(line => ({
      ...line, displayNumber: String(line.displayNumber), version: line.expectedVersion,
      ready: false, duplicate: false, manifestCertified: line.application === "APPLIED", result: line.code ?? "READY",
      retrySafe: line.application === "NOT_APPLIED" && line.retrySafe,
      failureCode: line.code,
      finalResult: line.application === "APPLIED" ? "ASSOCIÉ" : line.application === "UNKNOWN" ? "ÉTAT À VÉRIFIER" : "ÉCHEC"
    })));
    const associated = result.lines.filter(line => line.application === "APPLIED").length;
    setFinalSummary({ associated, alreadyAssociated: 0, errors: result.lines.length - associated, notProcessed: 0 });
    setError("");
    if (result.status === "COMPLETED") { setInput(""); onAssignmentsCompleted?.(); }
  }

  async function handleCheckBatch() {
    if (inFlight.current || !batchId) return;
    inFlight.current = true;
    setBusy(true);
    try { applyBatchResult(await readQrBatchStatus(getSupabaseBrowserClient().auth, batchId), lines); }
    catch { setError("État du lot indisponible. Ne renvoyez pas les associations avant vérification."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function handleRetryPrevalidate() {
    if (inFlight.current) return;
    const pending = lines.filter(line => line.retrySafe);
    if (!pending.length) return;
    inFlight.current = true;
    setBusy(true);
    setConfirmed(false);
    setError("");
    try {
      const checked = await prevalidateQrBatch(getSupabaseBrowserClient().auth, pending.map(line => ({
        lineNumber: line.lineNumber, displayNumber: line.displayNumber, agency: line.agency, trackingCode: line.trackingCode
      })));
      const previous = new Map(pending.map(line => [line.lineNumber, line]));
      setRetainedResults(old => [...old, ...lines.filter(line => !line.retrySafe)]);
      setLines(checked.map(line => ({ ...line, requestId: previous.get(line.lineNumber)?.requestId })));
      setFinalSummary(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Prévalidation série impossible.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5" aria-label="Association QR en série">
      {readyCount ? <section className="rounded-xl border border-accent/30 bg-accent/10 p-4">
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} className="mt-1"/><span>Je confirme explicitement ce lot entièrement prévalidé. Toutes les associations sont validées ensemble ou annulées ensemble.</span></label>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="growth" disabled={busy || !confirmed || readyCount !== lines.length} onClick={() => void handleConfirm()}><CheckCircle2 className="h-4 w-4"/>{confirming ? "Association en cours…" : "Confirmer les associations valides"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={invalidate}>Annuler</Button>
        </div>
      </section> : null}
      <label className="block text-sm">Correspondances QR → colis
        <textarea
          value={input}
          onChange={(event) => { setInput(event.target.value); invalidate(); }}
          rows={8}
          placeholder={"014 | KLZ | AT09526\n015 | KLZ | AT09626B\n016 | FIH | MR12326"}
          disabled={busy}
          className="mt-2 w-full rounded-md border border-white/15 bg-ebe-night p-3 font-mono text-sm text-white placeholder:text-muted-foreground disabled:opacity-70"
        />
      </label>
      <p className="text-xs text-muted-foreground">Une ligne = numéro QR visible | destination | code colis complet. Maximum 250 associations, avec validation transactionnelle du lot.</p>
      {batchId ? <section className="text-sm"><p>Dernier lot : {batchId}</p><Button type="button" variant="outline" disabled={busy} onClick={() => void handleCheckBatch()}>Vérifier le lot (lecture seule)</Button></section> : null}
      <Button type="button" variant="growth" className="w-full" disabled={busy} onClick={() => void handlePrevalidate()}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <ShieldCheck className="h-4 w-4"/>}
        {busy ? "Prévalidation en cours…" : "Prévalider la série"}
      </Button>
      {error ? <p role="alert" className="rounded-md border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p> : null}
      {finalSummary ? <section role="status" aria-live="polite" className={`rounded-xl border-2 p-5 shadow-lg ${finalSummary.errors || finalSummary.notProcessed || hasUnresolvedResults ? "border-amber-300/50 bg-amber-400/10 text-amber-50" : "border-emerald-300/50 bg-emerald-400/15 text-emerald-50"}`}>
        <h2 className="text-lg font-black tracking-wide">{finalSummary.errors || finalSummary.notProcessed || hasUnresolvedResults ? "RÉSULTAT DE L’ASSOCIATION" : "ASSOCIATIONS RÉUSSIES"}</h2>
        <p className="mt-2 text-sm">Le traitement est terminé. Voici le résultat exact retourné par le serveur.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-black/15 p-3"><dt>ASSOCIÉS</dt><dd className="mt-1 text-2xl font-black">{finalSummary.associated}</dd></div>
          <div className="rounded-lg bg-black/15 p-3"><dt>DÉJÀ ASSOCIÉS</dt><dd className="mt-1 text-2xl font-black">{finalSummary.alreadyAssociated}</dd></div>
          <div className="rounded-lg bg-black/15 p-3"><dt>EN ERREUR</dt><dd className="mt-1 text-2xl font-black">{finalSummary.errors}</dd></div>
          <div className="rounded-lg bg-black/15 p-3"><dt>NON TRAITÉS</dt><dd className="mt-1 text-2xl font-black">{finalSummary.notProcessed}</dd></div>
        </dl>
      </section> : null}
      {lines.some(line => line.retrySafe) ? <Button type="button" variant="outline" disabled={busy} onClick={() => void handleRetryPrevalidate()}>Prévalider uniquement les lignes non appliquées</Button> : null}
      {displayedLines.some(line => line.finalResult === "ÉTAT À VÉRIFIER") ? <p role="alert">État incertain : vérifiez les associations réelles avant toute nouvelle tentative. Aucun succès ne sera rejoué automatiquement.</p> : null}
      {lines.length ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-white/5 text-muted-foreground"><tr><th className="p-3">N° QR</th><th>qrId</th><th>Destination</th><th>Code colis</th><th>État QR</th><th>MANIFESTE</th><th>Doublon</th><th>Résultat</th></tr></thead>
              <tbody>{displayedLines.map((line) => <tr key={line.lineNumber} className={line.result === "QR_ALREADY_ASSIGNED" ? "border-t border-red-300/30 bg-red-500/15" : "border-t border-white/10"}>
                <td className="p-3">{line.displayNumber || "—"}</td><td>{line.qrId ?? "—"}</td><td>{line.agency || "—"}</td><td>{line.trackingCode || "—"}</td><td>{line.qrStatus ?? "—"}</td><td>{line.manifestCertified ? "CERTIFIÉ" : "NON"}</td><td>{line.duplicate ? "OUI" : "NON"}</td><td className={line.ready ? "text-accent" : "text-amber-200"}>{line.result === "QR_ALREADY_ASSIGNED" ? <span className="font-bold text-red-100">QR DÉJÀ UTILISÉ<br/><span className="font-normal">Actuel : {line.currentAgency ?? "—"} · {line.currentTrackingCode ?? "—"}</span></span> : line.finalResult ?? RESULT_LABELS[line.result] ?? line.result}</td>
              </tr>)}</tbody>
            </table>
            {displayedLines.filter(line => line.failureCode).map(line => <p key={`error-${line.lineNumber}`} className="p-2 text-sm">N° QR {line.displayNumber} · {line.agency} · {line.trackingCode} : {line.failureCode}</p>)}
          </div>
          <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm"><strong>{readyCount}</strong> ligne(s) prête(s) · <strong>{errorCount}</strong> ligne(s) en erreur ou terminée(s)</p>
        </>
      ) : null}
    </section>
  );
}
