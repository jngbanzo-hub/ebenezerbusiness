"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Container, GlassPanel } from "@/components/design-system";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

const API = "/api/admin/expenses/cash-recovery";

type Preview = {
  expenseRequestId: string;
  agency: "KLZ";
  amount: number;
  currency: "USD";
  sourceDate: string;
  sourceStatus: string;
  sourceAgent: string;
  cashEventCount: number;
  eligible: boolean;
};

export function CashExpenseRecoveryPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checked, setChecked] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void authorizedFetch(API, { method: "GET" })
      .then(readResponse<Preview>)
      .then((value) => { if (active) setPreview(value); })
      .catch(() => { if (active) setMessage("La dépense source ou la Caisse ne peut pas être certifiée. Aucune action n'a été effectuée."); });
    return () => { active = false; };
  }, []);

  async function confirm() {
    if (!preview?.eligible || !checked || working) return;
    if (!window.confirm(`Confirmer uniquement le débit Caisse manquant de ${preview.amount} ${preview.currency} pour cette dépense ${preview.agency} ?`)) return;
    setWorking(true);
    setMessage("");
    try {
      const result = await readResponse<{ cashEventCount: number; debitCreated: boolean; alreadyRecorded: boolean }>(
        await authorizedFetch("/api/admin/expenses/cash-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: "CONFIRMER_DEBIT_CAISSE_KLZ"
          })
        })
      );
      setMessage(result.debitCreated
        ? "Débit Caisse unique confirmé. Aucune dépense nouvelle n'a été créée."
        : "Débit Caisse déjà présent. Aucun nouveau mouvement créé.");
      setPreview({ ...preview, cashEventCount: result.cashEventCount, eligible: false });
    } catch {
      setPreview(null);
      setChecked(false);
      setMessage("Reprise non certifiée. Vérifiez l'état du dossier avant toute autre action.");
    } finally {
      setWorking(false);
    }
  }

  return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container className="max-w-3xl">
    <Link href="/admin/anomalies" className="text-sm font-semibold text-accent">← Centre d’anomalies</Link>
    <h1 className="mt-5 text-3xl font-semibold">Finaliser le débit Caisse manquant</h1>
    <p className="mt-2 text-sm text-muted-foreground">Dépense déjà enregistrée. Cette action ne recrée pas la dépense et ne change aucun montant.</p>
    <GlassPanel className="mt-6 space-y-3 p-6">
      {preview ? <p className="break-all font-mono text-xs">{preview.expenseRequestId}</p> : null}
      {preview ? <>
        <p>{preview.agency} · {preview.amount} {preview.currency} · {preview.sourceStatus}</p>
        <p className="text-sm">Source : {new Date(preview.sourceDate).toLocaleString("fr-FR", { timeZone: "Africa/Porto-Novo" })} · {preview.sourceAgent}</p>
        <p className="text-sm">Débits Caisse liés : {preview.cashEventCount}</p>
        {preview.eligible ? <>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />Je confirme avoir vérifié cette dépense et souhaite créer uniquement son débit Caisse manquant.</label>
          <button type="button" onClick={() => void confirm()} disabled={!checked || working} className="rounded-md bg-accent px-4 py-2 font-semibold text-ebe-night disabled:opacity-50">{working ? "Vérification…" : "Finaliser le débit Caisse — sans nouvelle dépense"}</button>
        </> : <p className="text-sm text-amber-200">Reprise indisponible : un débit lié existe déjà.</p>}
      </> : !message ? <p>Vérification de la source et de la Caisse…</p> : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </GlassPanel>
  </Container></main>;
}

async function authorizedFetch(input: string, init: RequestInit) {
  const session = await getSupabaseBrowserClient().auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("Session absente.");
  // Une confirmation financière ne doit jamais être rejouée automatiquement.
  return fetch(input, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, Authorization: `Bearer ${token}` }
  });
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("Reprise indisponible.");
  return response.json() as Promise<T>;
}
