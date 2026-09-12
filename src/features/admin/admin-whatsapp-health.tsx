"use client";

import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/design-system";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";

type DependencyStatus = "OPERATIONAL" | "ACTIVE" | "PROBLEM" | "UNKNOWN";
type Health = Readonly<{ overallStatus: "SAIN" | "ATTENTION" | "INCIDENT"; dialog360: DependencyStatus; scheduler: DependencyStatus; cloudRun: DependencyStatus; lastRun: "SUCCESS" | "FAILURE" | "EN COURS" | "UNKNOWN"; invalidRecipient24h: number; deliveryUncertainRecent: number; duplicates: number; checkedAt: string; unavailableDependencies?: readonly ("dialog360" | "scheduler" | "cloudRun" | "runs" | "metrics")[] }>;
type Payload = Readonly<{ status: "AVAILABLE" | "UNAVAILABLE"; health: Health | null }>;

export function AdminWhatsappHealth({ accessToken }: { accessToken: string }) {
  const [payload, setPayload] = useState<Payload>({ status: "UNAVAILABLE", health: null });
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    void authenticatedRead(getSupabaseBrowserClient().auth, "/api/admin/whatsapp-health", { signal: controller.signal }, fetch, accessToken)
      .then((response) => readJsonOrThrow<Payload>(response, "Santé WhatsApp indisponible."))
      .then(setPayload)
      .catch(() => setPayload({ status: "UNAVAILABLE", health: null }));
    return () => controller.abort();
  }, [accessToken]);

  const health = payload.health;
  return <GlassPanel className="p-5" aria-label="Santé WhatsApp">
    <h3 className="text-xl font-semibold text-accent">WHATSAPP</h3>
    <dl className="mt-4 space-y-3 text-sm">
      <Status label="État global" value={health?.overallStatus ?? "INDISPONIBLE"}/>
      <Status label="360dialog" value={health?.dialog360 ?? "INDISPONIBLE"}/>
      <Status label="Scheduler" value={health?.scheduler ?? "INDISPONIBLE"}/>
      <Status label="Cloud Run" value={health?.cloudRun ?? "INDISPONIBLE"}/>
      <Status label="Dernier passage" value={health?.lastRun ?? "INDISPONIBLE"}/>
      <Status label="Numéros invalides (24h)" value={health ? String(health.invalidRecipient24h) : "INDISPONIBLE"}/>
      <Status label="Livraisons non confirmées" value={health ? String(health.deliveryUncertainRecent) : "INDISPONIBLE"}/>
      <Status label="Doublons" value={health ? String(health.duplicates) : "INDISPONIBLE"}/>
      <Status label="Dernière vérification" value={health ? formatDate(health.checkedAt) : "INDISPONIBLE"}/>
    </dl>
  </GlassPanel>;
}

function Status({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-2"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-semibold">● {display(value)}</dd></div>; }
function display(value: string) { return value === "OPERATIONAL" ? "OPÉRATIONNEL" : value === "PROBLEM" ? "PROBLÈME" : value === "ACTIVE" ? "ACTIF" : value; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "INDISPONIBLE" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Porto-Novo" }).format(date); }
