"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, LoaderCircle, ShieldCheck } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { AgentTransferActions } from "@/features/transferts/agent-transfer-actions";
import { AgentTransferForm } from "@/features/transferts/agent-transfer-form";
import { loadAgentTransfers, TransfertsApiError } from "@/features/transferts/api";
import type { TransferStatus, TransfersPageResponse } from "@/features/transferts/types";

export function AgentTransfertsPage() {
  const router = useRouter();
  const [result, setResult] = useState<TransfersPageResponse | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [direction, setDirection] = useState<"SENT" | "RECEIVED">("SENT");
  const [status, setStatus] = useState<TransferStatus | "">("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          router.replace("/auth/sign-in");
          return;
        }
        setToken(session.access_token);
        const data = await loadAgentTransfers(session.access_token, controller.signal);
        if (active) setResult(data);
      } catch (caught) {
        if (!active || controller.signal.aborted) return;
        if (caught instanceof TransfertsApiError && caught.status === 401) {
          await signOutAgent().catch(() => undefined);
          router.replace("/auth/sign-in");
          return;
        }
        setError(caught instanceof Error ? caught.message : "Le module Transferts est indisponible.");
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [router, reloadKey]);

  const visibleTransfers = useMemo(() => {
    if (!result?.agency) return [];
    return result.transfers.filter((transfer) => {
      const matchesDirection = direction === "SENT"
        ? transfer.agencyFrom === result.agency
        : transfer.agencyTo === result.agency;
      return matchesDirection &&
        (!status || transfer.status === status) &&
        (!search || transfer.transferId.toLowerCase().includes(search.trim().toLowerCase()));
    });
  }, [direction, result, search, status]);

  return (
    <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12">
      <Container>
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="growth">{result?.writesEnabled ? "OPÉRATIONS AUTORISÉES" : "EN PRÉPARATION"}</Badge>
            <h1 className="mt-3 text-3xl font-semibold">Transferts</h1>
            <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-muted-foreground">
              {"Le module Transferts est en cours de préparation.\nLes opérations réelles seront disponibles après autorisation de mise en service."}
            </p>
          </div>
          <Button asChild variant="outline"><Link href="/agent">Retour au tableau de bord</Link></Button>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Status label="Statut du module" value="PRÉPARATION" />
          <Status label="Agence connectée" value={result?.agency ?? "Vérification…"} />
          <Status label="Rôle connecté" value={result?.role ?? "AGENT"} />
          <Status label="Disponibilité API" value={result?.apiAvailable ? "DISPONIBLE" : error ? "INDISPONIBLE" : "VÉRIFICATION"} />
          <Status label="Écritures" value={result?.writesEnabled ? "ACTIVÉES" : "DÉSACTIVÉES"} />
        </section>

        <GlassPanel className="mt-6 p-5 sm:p-6" glow="growth">
          {!result && !error ? (
            <p className="flex items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin text-accent" /> Chargement sécurisé…
            </p>
          ) : error ? (
            <p role="alert" className="text-sm text-amber-100">{error}</p>
          ) : result ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant={direction === "SENT" ? "default" : "outline"} onClick={() => setDirection("SENT")}>Envoyés</Button>
                <Button variant={direction === "RECEIVED" ? "default" : "outline"} onClick={() => setDirection("RECEIVED")}>Reçus</Button>
                <select value={status} onChange={(event) => setStatus(event.target.value as TransferStatus | "")} className="rounded-md border border-white/15 bg-ebe-night px-3 text-sm">
                  <option value="">Tous les statuts</option>
                  {["ENVOYE", "CODE_RECU", "FONDS_RETIRES", "CONFIRME", "A_VERIFIER", "ANNULE"].map((item) => <option key={item}>{item}</option>)}
                </select>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher Transfer ID" className="rounded-md border border-white/15 bg-ebe-night px-3 text-sm" />
              </div>
              {visibleTransfers.map((transfer) => (
                <div key={transfer.transferId} className="rounded-lg border border-white/10 p-4 text-sm">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <span>{transfer.sentAt}</span>
                    <span>{transfer.agencyFrom} → {transfer.agencyTo}</span>
                    <span>{transfer.amount.toFixed(2)} {transfer.currency}</span>
                    <span>{transfer.maskedCode} · {transfer.status}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Transfer ID : {transfer.transferId}</p>
                  {token && result.agency && <AgentTransferActions token={token} transfer={transfer} agency={result.agency} enabled={result.writesEnabled} onSuccess={reload} />}
                </div>
              ))}
              {!visibleTransfers.length && <p className="text-sm text-muted-foreground">Aucun transfert ne correspond aux filtres.</p>}
            </div>
          ) : null}
        </GlassPanel>

        <GlassPanel className="mt-6 border-accent/20 p-5">
          <div className="flex gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm text-muted-foreground">Les codes affichés sont toujours masqués. Les opérations restent soumises aux autorisations de l’agence et aux verrous serveur.</p>
          </div>
          <div className="mt-4">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><ArrowRightLeft className="h-4 w-4" /> Nouveau transfert</h2>
            {token && result?.agency
              ? <AgentTransferForm token={token} agency={result.agency} enabled={result.writesEnabled} onSuccess={reload} />
              : <p className="text-sm text-amber-100">Les opérations de transfert ne sont pas encore activées.</p>}
          </div>
        </GlassPanel>
      </Container>
    </main>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return <GlassPanel className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-semibold">{value}</p></GlassPanel>;
}
