"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, PackageSearch, Save } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAllowedDestinations } from "@/features/agent/agencies";
import { getAgentProfile, signOutAgent } from "@/features/agent/auth";
import { AgentApiError, savePayment, searchParcel } from "@/features/agent/functions";
import { formatAmount, parseParcelResponse } from "@/features/agent/parcel";
import {
  fingerprintPaymentIntent,
  getOrCreatePaymentAttempt,
  isPaymentAmountAllowed,
  type PaymentAttempt
} from "@/features/agent/payment-request-id";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import {
  PAYMENT_MODES,
  DESTINATIONS,
  type AgentProfile,
  type DestinationCode,
  type Parcel,
  type PaymentMode
} from "@/features/agent/types";

const fieldClassName =
  "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60";

export function AgentWorkspace({ initialTrackingCode = "" }: { initialTrackingCode?: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [authError, setAuthError] = useState("");
  const [destination, setDestination] = useState<DestinationCode>("FIH");
  const [codeColis, setCodeColis] = useState(
    /^[A-Z0-9][A-Z0-9._/-]{1,63}$/i.test(initialTrackingCode.trim())
      ? initialTrackingCode.trim().toUpperCase()
      : ""
  );
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [routingQuote, setRoutingQuote] = useState<{ routingReference: string; origin: string; destination: string; weightKg: number; rateUsdPerKg: number; amountExpectedUsd: number } | null>(null);
  const [parcelAction, setParcelAction] = useState<{ totalPaid: number; paymentSites: string[]; physicallyPresent: boolean; delivered: boolean; fullyPaidAtCooOnly: boolean } | null>(null);
  const [montantPaye, setMontantPaye] = useState("");
  const [modePaiement, setModePaiement] = useState<PaymentMode>("ESPECES");
  const [referencePaiement, setReferencePaiement] = useState("");
  const [observation, setObservation] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
    details?: string[];
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const paymentLockRef = useRef(false);
  const paymentAttemptRef = useRef<PaymentAttempt | null>(null);

  const destinations = useMemo(
    () => (profile ? getAllowedDestinations(profile.agence) : []),
    [profile]
  );

  useEffect(() => {
    let active = true;

    async function protectRoute() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session?.user) {
          router.replace("/auth/sign-in");
          return;
        }

        const agentProfile = await getAgentProfile(session.user);
        if (!active) return;

        setProfile(agentProfile);
        setDestination(getAllowedDestinations(agentProfile.agence)[0]);
      } catch (error) {
        await signOutAgent().catch(() => undefined);
        if (!active) return;
        setAuthError(error instanceof Error ? error.message : "Accès refusé.");
      }
    }

    void protectRoute();
    const supabase = getSupabaseBrowserClient();
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setProfile(null);
        router.replace("/auth/sign-in");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    await signOutAgent();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !DESTINATIONS.includes(destination)) {
      setMessage({ type: "error", text: "Destination invalide." });
      return;
    }

    setMessage(null);
    setParcel(null);
    setRoutingQuote(null);
    setParcelAction(null);
    paymentAttemptRef.current = null;
    setIsSearching(true);

    try {
      const normalizedCode = codeColis.trim().toUpperCase();
      const response = await searchParcel({
        destinationCode: destination,
        codeColis: normalizedCode
      });
      const foundParcel = parseParcelResponse(response);
      if (
        foundParcel.codeColis.toUpperCase() !== normalizedCode ||
        foundParcel.destinationCode !== destination
      ) {
        throw new Error("La réponse de recherche ne correspond pas au colis demandé.");
      }
      setParcel(foundParcel);
      if (profile.agence !== "COTONOU" && destination !== profile.agence) {
        setRoutingQuote(await loadInterAgencyQuote(foundParcel.codeColis, destination));
      } else if (profile.agence !== "COTONOU") {
        setParcelAction(await loadParcelAction(foundParcel.codeColis));
      }
      setMontantPaye("");
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Recherche impossible."
      });
    } finally {
      setIsSearching(false);
    }
  }

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paymentLockRef.current) {
      return;
    }

    paymentLockRef.current = true;
    setIsSaving(true);

    try {
      if (!profile || !parcel || !destinations.includes(destination)) {
        throw new Error("Paiement non autorisé.");
      }

      const exactBalance = getExactBalance(parcel);
      if (exactBalance === null) {
        throw new Error(
          "Enregistrement bloqué : la recherche ne fournit pas le solde exact du colis."
        );
      }

      const amount = Number(montantPaye.replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Saisissez un montant payé valide.");
      }
      if (amount > exactBalance) {
        throw new Error("Le montant payé ne peut pas dépasser le solde.");
      }
      if (!isPaymentAmountAllowed(profile.agence, amount, exactBalance)) {
        throw new Error(
          "Le montant doit correspondre exactement au solde restant pour cette agence."
        );
      }
      if (!PAYMENT_MODES.includes(modePaiement)) {
        throw new Error("Le mode de paiement est invalide.");
      }

      const paymentIntent = {
        codeColis: parcel.codeColis,
        destinationCode: parcel.destinationCode,
        montantPaye: amount,
        modePaiement,
        referencePaiement: referencePaiement.trim(),
        observation: observation.trim()
      };
      const attempt = getOrCreatePaymentAttempt(
        paymentAttemptRef.current,
        fingerprintPaymentIntent(paymentIntent)
      );
      paymentAttemptRef.current = attempt;

      setMessage(null);
      const result = await savePayment({
        ...paymentIntent,
        paymentRequestId: attempt.paymentRequestId
      });
      paymentAttemptRef.current = null;
      setMessage({
        type: "success",
        text:
          result.cashStatus === "ACCOUNT_NOT_ACTIVE"
            ? "Paiement enregistré avec succès. La caisse de l’agence n’est pas encore ouverte ; aucun mouvement de caisse n’a été créé."
            : "Paiement enregistré avec succès.",
        details: [
          `Montant payé : ${formatAmount(result.montantPaye)}`,
          `Nouveau total payé : ${formatAmount(result.nouveauTotalPaye)}`,
          `Nouveau solde : ${formatAmount(result.nouveauSolde)}`,
          `Statut du paiement : ${formatPaymentStatus(result.statutPaiement)}`
        ]
      });
      setParcel(null);
      setCodeColis("");
      setMontantPaye("");
      setReferencePaiement("");
      setObservation("");
      setModePaiement("ESPECES");
    } catch (error) {
      if (error instanceof AgentApiError && error.code === "PAIEMENT_DEJA_ENREGISTRE") {
        paymentAttemptRef.current = null;
        setMessage({ type: "success", text: "Ce paiement a déjà été enregistré." });
        setParcel(null);
        setMontantPaye("");
        return;
      }
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Enregistrement impossible."
      });
    } finally {
      paymentLockRef.current = false;
      setIsSaving(false);
    }
  }

  const parsedAmount = Number(montantPaye.replace(",", "."));
  const exactBalance = parcel ? getExactBalance(parcel) : null;
  const isAmountValid =
    exactBalance !== null &&
    profile !== null &&
    isPaymentAmountAllowed(profile.agence, parsedAmount, exactBalance);
  const isPaymentModeValid = PAYMENT_MODES.includes(modePaiement);
  const canSavePayment =
    Boolean(parcel) &&
    exactBalance !== null &&
    exactBalance > 0 &&
    isAmountValid &&
    isPaymentModeValid &&
    !isSaving;

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-ebe-night px-4 text-white">
        <GlassPanel className="w-full max-w-md p-6 text-center" glow="growth">
          {authError ? (
            <>
              <h1 className="text-xl font-semibold">Accès refusé</h1>
              <p role="alert" className="mt-3 text-sm text-red-200">{authError}</p>
              <Button className="mt-6" onClick={() => router.replace("/auth/sign-in")}>
                Retour à la connexion
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">Vérification de votre accès…</p>
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
            <Badge variant="growth">Encaissements</Badge>
            <h1 className="mt-3 text-3xl font-semibold">{profile.nom}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Agence : {profile.agence}</p>
          </div>
          <Button type="button" variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </Button>
        </header>

        <div className="mx-auto mt-8 grid max-w-4xl gap-6">
          <GlassPanel className="p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Rechercher un colis</h2>
            <form onSubmit={handleSearch} className="mt-5 grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
              <label className="text-sm font-medium">
                Destination
                <select
                  value={destination}
                  onChange={(event) => setDestination(event.target.value as DestinationCode)}
                  className={fieldClassName}
                >
                  {DESTINATIONS.map((item) => (
                    <option key={item} value={item} className="bg-ebe-navy">
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Code colis
                <input
                  required
                  value={codeColis}
                  onChange={(event) => setCodeColis(event.target.value)}
                  className={fieldClassName}
                  placeholder="Saisir le code"
                />
              </label>
              <Button type="submit" variant="growth" disabled={isSearching}>
                <PackageSearch className="h-4 w-4" />
                {isSearching ? "Recherche…" : "Rechercher"}
              </Button>
            </form>
          </GlassPanel>

          {message ? (
            <p
              role="alert"
              className={`rounded-md border p-4 text-sm ${
                message.type === "success"
                  ? "border-accent/25 bg-accent/10 text-accent"
                  : "border-red-400/25 bg-red-400/10 text-red-200"
              }`}
            >
              {message.text}
              {message.details ? (
                <span className="mt-2 block space-y-1">
                  {message.details.map((detail) => (
                    <span key={detail} className="block">
                      {detail}
                    </span>
                  ))}
                </span>
              ) : null}
            </p>
          ) : null}

          {parcel ? (
            <GlassPanel className="p-5 sm:p-6" glow="growth">
              <h2 className="text-xl font-semibold">Colis {parcel.codeColis}</h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ParcelValue
                  label="Destination"
                  value={`${parcel.destinationNom} (${parcel.destinationCode})`}
                />
                <ParcelValue label="Date du colis" value={parcel.dateColis} />
                <ParcelValue label="Poids" value={`${parcel.poidsKg} kg`} />
                <ParcelValue label="Montant attendu" value={formatAmount(parcel.montantAttendu)} />
                <ParcelValue label="Statut du colis" value={parcel.statutColis} />
                <ParcelValue
                  label="Déjà payé"
                  value={formatAmount(parcel.montantDejaPaye)}
                />
                <ParcelValue
                  label="Solde"
                  value={formatAmount(parcel.soldeRestant)}
                  highlight
                />
              </dl>

              {!routingQuote ? <p className="mt-5 rounded-lg border border-accent/25 bg-accent/10 p-3 font-semibold text-accent">Statut : {parcelStatus(parcel, parcelAction)}</p> : null}

              {routingQuote ? <div className="mt-7 rounded-xl border border-accent/30 bg-accent/10 p-5"><h3 className="font-semibold text-accent">ACHEMINEMENT INTER-AGENCES</h3><p className="mt-2 text-sm">Référence : {routingQuote.routingReference}</p><p className="text-sm">Circuit : {routingQuote.origin} → {routingQuote.destination}</p><p className="text-sm">Poids canonique : {routingQuote.weightKg} kg · Tarif : {formatAmount(routingQuote.rateUsdPerKg)}/kg</p><p className="text-sm font-semibold">Montant attendu : {formatAmount(routingQuote.amountExpectedUsd)}</p><Button type="button" variant="growth" className="mt-4" disabled>Créer un acheminement — activation ultérieure</Button></div> : parcel.soldeRestant > 0 ? <form onSubmit={handlePayment} className="mt-7 grid gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Montant payé
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max={parcel.soldeRestant}
                      step="0.01"
                      required
                      disabled={parcel.soldeRestant <= 0}
                      value={montantPaye}
                      onChange={(event) => setMontantPaye(event.target.value)}
                      className={fieldClassName}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Mode de paiement
                    <select
                      value={modePaiement}
                      onChange={(event) => setModePaiement(event.target.value as PaymentMode)}
                      className={fieldClassName}
                    >
                      {PAYMENT_MODES.map((mode) => (
                        <option key={mode} value={mode} className="bg-ebe-navy">
                          {formatPaymentMode(mode)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Référence (facultative)
                    <input
                      value={referencePaiement}
                      onChange={(event) => setReferencePaiement(event.target.value)}
                      className={fieldClassName}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Observation (facultative)
                    <input
                      value={observation}
                      onChange={(event) => setObservation(event.target.value)}
                      className={fieldClassName}
                    />
                  </label>
                </div>
                <Button
                  type="submit"
                  variant="growth"
                  size="lg"
                  disabled={!canSavePayment}
                >
                  <Save className="h-5 w-5" />
                  {isSaving ? "Enregistrement…" : "Enregistrer le paiement"}
                </Button>
              </form> : parcelAction?.fullyPaidAtCooOnly && parcelAction.physicallyPresent && !parcelAction.delivered ? <Button type="button" variant="growth" className="mt-7" onClick={() => void confirmPhysicalRemittance(parcel.codeColis, setMessage, setParcel)}>Confirmer la remise</Button> : null}
            </GlassPanel>
          ) : null}
        </div>
      </Container>
    </main>
  );
}

function formatPaymentMode(mode: PaymentMode): string {
  return mode === "MOBILE_MONEY" ? "Mobile Money" : mode;
}

function formatPaymentStatus(status: "SOLDE" | "PARTIELLEMENT PAYE"): string {
  return status === "SOLDE" ? "Soldé" : "Partiellement payé";
}

function getExactBalance(parcel: Parcel): number | null {
  return Number.isFinite(parcel.soldeRestant) && parcel.soldeRestant >= 0
    ? parcel.soldeRestant
    : null;
}

async function loadInterAgencyQuote(trackingCode: string, destination: DestinationCode) {
  const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
  if (!session?.access_token) throw new Error("Session expirée.");
  const params = new URLSearchParams({ trackingCode, destination });
  const response = await fetch(`/api/agent/inter-agency-routing/quote?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
  const payload = await response.json().catch(() => null) as { quote?: { routingReference: string; origin: string; destination: string; weightKg: number; rateUsdPerKg: number; amountExpectedUsd: number }; message?: string } | null;
  if (!response.ok || !payload?.quote) throw new Error(payload?.message ?? "Acheminement indisponible.");
  return payload.quote;
}

async function loadParcelAction(trackingCode: string) { const { data: { session } } = await getSupabaseBrowserClient().auth.getSession(); if (!session?.access_token) throw new Error("Session expirée."); const response=await fetch(`/api/agent/stockages/payment-action?trackingCode=${encodeURIComponent(trackingCode)}`,{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"}); const payload=await response.json().catch(()=>null) as {action?:{totalPaid:number;paymentSites:string[];physicallyPresent:boolean;delivered:boolean;fullyPaidAtCooOnly:boolean};message?:string}|null; if(!response.ok||!payload?.action)throw new Error(payload?.message??"Situation indisponible."); return payload.action; }
function parcelStatus(parcel: Parcel, action: { physicallyPresent:boolean; delivered:boolean; fullyPaidAtCooOnly:boolean } | null) { if(parcel.soldeRestant>0)return parcel.montantDejaPaye>0?"COLIS AVEC SOLDE RESTANT":"COLIS À ENCAISSER"; if(action?.delivered)return "LIVRAISON TERMINÉE"; if(action?.fullyPaidAtCooOnly)return action.physicallyPresent?"PAIEMENT COO — COLIS PRÊT À REMETTRE":"PAIEMENT COO — EN ATTENTE D’ARRIVAGE"; return action?.physicallyPresent?"PAIEMENT TERMINÉ — SORTIE PHYSIQUE À FINALISER":"PAIEMENT TERMINÉ — COLIS NON PRÉSENT"; }
async function confirmPhysicalRemittance(trackingCode:string,setMessage:React.Dispatch<React.SetStateAction<{type:"success"|"error";text:string;details?:string[]}|null>>,setParcel:React.Dispatch<React.SetStateAction<Parcel|null>>){ if(!window.confirm(`Confirmer la remise physique du colis ${trackingCode} ?`))return; try{const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();if(!session?.access_token)throw new Error("Session expirée.");const response=await fetch("/api/agent/stockages/delivery",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({trackingCode,physicalDeliveryConfirmed:true,requestId:crypto.randomUUID()})});const payload=await response.json().catch(()=>null) as {message?:string};if(!response.ok)throw new Error(payload?.message??"Remise refusée.");setMessage({type:"success",text:"Remise physique confirmée. La sortie Stockages a été enregistrée."});setParcel(null);}catch(error){setMessage({type:"error",text:error instanceof Error?error.message:"Remise refusée."});}}

function ParcelValue({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-2 font-semibold ${highlight ? "text-accent" : "text-white"}`}>{value}</dd>
    </div>
  );
}
