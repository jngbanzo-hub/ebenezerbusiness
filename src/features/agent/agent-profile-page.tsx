"use client";

import { LoaderCircle, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/design-system";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

type Profile = { id: string; email: string; nom: string; role: "AGENT"; agence: string; site: string; actif: true; lastSignInAt: string | null };

export function AgentProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null), [error, setError] = useState("");
  useEffect(() => { void (async () => { try { const { data: { session } } = await getSupabaseBrowserClient().auth.getSession(); if (!session?.access_token) throw new Error("Session expirée."); const response = await fetch("/api/agent/profile", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }); const value = await response.json(); if (!response.ok) throw new Error(value.message ?? "Profil indisponible."); setProfile(value); } catch (cause) { setError(cause instanceof Error ? cause.message : "Profil indisponible."); } })(); }, []);
  if (!profile) return <main className="grid min-h-screen place-items-center bg-ebe-night text-white">{error ? <p role="alert" className="text-red-200">{error}</p> : <LoaderCircle className="h-7 w-7 animate-spin text-accent"/>}</main>;
  const initials = profile.nom.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <main className="min-h-screen bg-ebe-night py-8 text-white"><div className="mx-auto max-w-3xl px-4"><a href="/agent" className="text-sm font-semibold text-accent">← Retour au tableau de bord</a><h1 className="mt-3 text-3xl font-semibold">Mon profil</h1><GlassPanel className="mt-8 p-6 sm:p-8"><div className="flex flex-col gap-6 sm:flex-row sm:items-center"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/15 text-3xl font-bold text-accent" aria-label={`Avatar ${initials}`}><span>{initials || <UserRound/>}</span></div><div><h2 className="text-2xl font-semibold">{profile.nom}</h2><p className="mt-1 text-muted-foreground">{profile.email}</p></div></div><dl className="mt-8 grid gap-4 sm:grid-cols-2">{[["Agence", profile.site],["Rôle", "Agent"],["Statut du compte", "ACTIF"],["Identifiant Agent", profile.id],["Dernière connexion", profile.lastSignInAt ? new Date(profile.lastSignInAt).toLocaleString("fr-FR") : "Non disponible"]].map(([label,value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-2 break-all font-semibold">{value}</dd></div>)}</dl><p className="mt-6 text-xs text-muted-foreground">Agence, rôle, statut et identifiant sont protégés et disponibles en lecture seule.</p></GlassPanel></div></main>;
}
