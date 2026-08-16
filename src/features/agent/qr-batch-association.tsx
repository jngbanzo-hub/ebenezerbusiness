"use client";

import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { parseQrBatchInput } from "@/features/agent/qr-batch-parser";
import {
  createQrAssignmentRequestId,
  prevalidateQrBatch,
  submitQrAssociation,
  type QrAgency,
  type QrBatchPrevalidationLine
} from "@/features/agent/qr-association-client";

type FinalLine = QrBatchPrevalidationLine & {
  finalResult?: "ASSOCIÉ" | "CONFLIT DE VERSION" | "ÉCHEC";
  requestId?: string;
};

const RESULT_LABELS: Record<string, string> = {
  READY: "PRÊT",
  INVALID_QR_NUMBER: "QR INVALIDE",
  QR_UNKNOWN: "QR INCONNU",
  QR_ALREADY_ASSIGNED: "QR DÉJÀ ASSOCIÉ",
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const readyCount = useMemo(() => lines.filter((line) => line.ready && !line.finalResult).length, [lines]);
  const errorCount = lines.length - readyCount;

  useEffect(() => {
    if (!initialInput) return;
    setInput(initialInput);
    invalidate();
  }, [initialInput]);

  function invalidate() {
    setLines([]);
    setConfirmed(false);
    setError("");
  }

  async function handlePrevalidate() {
    invalidate();
    const parsed = parseQrBatchInput(input);
    if (!parsed.length) {
      setError("Ajoutez au moins une ligne au format : 014 | KLZ | AT09526");
      return;
    }
    setBusy(true);
    try {
      setLines(await prevalidateQrBatch(getSupabaseBrowserClient().auth, parsed));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Prévalidation série impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    const readyLines = lines.filter((line) => line.ready && line.version !== undefined);
    if (!readyLines.length || !confirmed) return;
    setBusy(true);
    setError("");
    const next = [...lines];
    for (const line of readyLines) {
      const requestId = createQrAssignmentRequestId();
      const index = next.findIndex((item) => item.lineNumber === line.lineNumber);
      try {
        await submitQrAssociation(getSupabaseBrowserClient().auth, {
          displayNumber: Number(line.displayNumber),
          agency: line.agency as QrAgency,
          trackingCode: line.trackingCode,
          expectedVersion: line.version!,
          requestId
        });
        next[index] = { ...line, requestId, ready: false, finalResult: "ASSOCIÉ" };
      } catch (cause) {
        const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
        next[index] = {
          ...line,
          requestId,
          ready: false,
          finalResult: code === "QR_VERSION_CONFLICT" || code === "QR_NOT_UNASSIGNED"
            ? "CONFLIT DE VERSION"
            : "ÉCHEC"
        };
      }
      setLines([...next]);
    }
    setBusy(false);
    setConfirmed(false);
    onAssignmentsCompleted?.();
  }

  return (
    <section className="space-y-5" aria-label="Association QR en série">
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
      <p className="text-xs text-muted-foreground">Une ligne = numéro QR visible | destination | code colis complet. Chaque ligne est indépendante.</p>
      <Button type="button" variant="growth" className="w-full" disabled={busy} onClick={() => void handlePrevalidate()}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <ShieldCheck className="h-4 w-4"/>}
        Prévalider la série
      </Button>
      {error ? <p role="alert" className="rounded-md border border-red-300/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p> : null}
      {lines.length ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-white/5 text-muted-foreground"><tr><th className="p-3">N° QR</th><th>qrId</th><th>Destination</th><th>Code colis</th><th>État QR</th><th>MANIFESTE</th><th>Doublon</th><th>Résultat</th></tr></thead>
              <tbody>{lines.map((line) => <tr key={line.lineNumber} className="border-t border-white/10">
                <td className="p-3">{line.displayNumber || "—"}</td><td>{line.qrId ?? "—"}</td><td>{line.agency || "—"}</td><td>{line.trackingCode || "—"}</td><td>{line.qrStatus ?? "—"}</td><td>{line.manifestCertified ? "CERTIFIÉ" : "NON"}</td><td>{line.duplicate ? "OUI" : "NON"}</td><td className={line.ready ? "text-accent" : "text-amber-200"}>{line.finalResult ?? RESULT_LABELS[line.result] ?? line.result}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm"><strong>{readyCount}</strong> ligne(s) prête(s) · <strong>{errorCount}</strong> ligne(s) en erreur ou terminée(s)</p>
          {readyCount ? <section className="rounded-xl border border-accent/30 bg-accent/10 p-4">
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} className="mt-1"/><span>Je confirme explicitement l’association indépendante des seules lignes PRÊTES.</span></label>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="growth" disabled={busy || !confirmed} onClick={() => void handleConfirm()}><CheckCircle2 className="h-4 w-4"/>Confirmer les associations valides</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={invalidate}>Annuler</Button>
            </div>
          </section> : null}
        </>
      ) : null}
    </section>
  );
}
