"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, SlidersHorizontal } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminProfile, signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

const fieldClassName =
  "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none";

export function AdminTransfertsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState("");
  const [agencyFrom, setAgencyFrom] = useState("");
  const [agencyTo, setAgencyTo] = useState("");
  const [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("");
  const [transferId, setTransferId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const filters = useMemo(
    () => ({ agencyFrom, agencyTo, status, currency, transferId, dateFrom, dateTo }),
    [agencyFrom, agencyTo, status, currency, transferId, dateFrom, dateTo]
  );

  useEffect(() => {
    let active = true;
    async function protect() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.replace("/auth/sign-in");
          return;
        }
        await getAdminProfile(session.user);
        if (active) setAuthorized(true);
      } catch (error) {
        await signOutAgent().catch(() => undefined);
        if (active) setAuthError(error instanceof Error ? error.message : "Accès interdit.");
      }
    }
    void protect();
    return () => { active = false; };
  }, [router]);

  if (!authorized) {
    return (
      <main className="grid min-h-screen place-items-center bg-ebe-night px-4 text-white">
        <GlassPanel className="w-full max-w-md p-6 text-center">
          {authError ? (
            <p role="alert" className="text-sm text-red-200">{authError}</p>
          ) : (
            <p className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin text-accent" /> Vérification de l’accès Admin…
            </p>
          )}
        </GlassPanel>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12">
      <Container>
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="growth">PRÉPARATION ADMIN</Badge>
            <h1 className="mt-3 text-3xl font-semibold">Supervision des transferts</h1>
            <p className="mt-3 text-sm text-muted-foreground">Consultation administrative désactivée jusqu’à l’autorisation de mise en service.</p>
          </div>
          <Button asChild variant="outline"><Link href="/admin">Retour à l’administration</Link></Button>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Status label="Statut du module" value="PRÉPARATION" />
          <Status label="Rôle connecté" value="ADMIN" />
          <Status label="Disponibilité API" value="NON TESTÉE" />
          <Status label="Écritures" value="DÉSACTIVÉES" />
          <Status label="Accès Admin" value="DÉSACTIVÉ" />
        </section>

        <GlassPanel className="mt-6 p-5 sm:p-6">
          <div className="flex items-center gap-3"><SlidersHorizontal className="h-5 w-5 text-accent" /><h2 className="text-xl font-semibold">Filtres préparatoires</h2></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Select label="Agence expéditrice" value={agencyFrom} onChange={setAgencyFrom} options={["COO", "FIH", "LSHI", "KLZ"]} />
            <Select label="Agence bénéficiaire" value={agencyTo} onChange={setAgencyTo} options={["COO", "FIH", "LSHI", "KLZ"]} />
            <Select label="Statut" value={status} onChange={setStatus} options={["ENVOYE", "CODE_RECU", "FONDS_RETIRES", "CONFIRME", "A_VERIFIER", "ANNULE"]} />
            <Select label="Devise" value={currency} onChange={setCurrency} options={["USD", "CDF", "XOF"]} />
            <label className="text-sm">Date de début<input type="date" className={fieldClassName} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label className="text-sm">Date de fin<input type="date" className={fieldClassName} value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
            <label className="text-sm">Transfer ID<input className={fieldClassName} value={transferId} onChange={(event) => setTransferId(event.target.value)} /></label>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Filtres sélectionnés : {Object.values(filters).filter(Boolean).length}. Aucun appel distant n’est effectué tant que l’accès Admin est désactivé.</p>
        </GlassPanel>

        <GlassPanel className="mt-6 border-amber-200/20 p-6">
          <p className="text-sm text-amber-100">Le module Transferts est en cours de préparation. Les listes, l’audit et les opérations administratives seront disponibles après autorisation.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button disabled>Consulter les transferts — désactivé</Button>
            <Button disabled variant="outline">Consulter l’audit — désactivé</Button>
          </div>
        </GlassPanel>
      </Container>
    </main>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return <GlassPanel className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-semibold">{value}</p></GlassPanel>;
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="text-sm">{label}<select className={fieldClassName} value={value} onChange={(event) => onChange(event.target.value)}><option value="" className="bg-ebe-navy">Toutes</option>{options.map((option) => <option key={option} value={option} className="bg-ebe-navy">{option}</option>)}</select></label>;
}
