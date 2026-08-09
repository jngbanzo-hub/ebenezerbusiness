"use client";

import Image from "next/image";
import { LoaderCircle, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/design-system";
import { getAgentProfilePhoto } from "@/features/agent/profile-photo-map";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

type Profile = { id: string; email: string; nom: string; role: "AGENT"; agence: string; site: string; actif: true; lastSignInAt: string | null };

const UNAVAILABLE_PERSONAL_INFORMATION = "Non renseigné";

export function AgentProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null), [error, setError] = useState("");
  useEffect(() => { void (async () => { try { const { data: { session } } = await getSupabaseBrowserClient().auth.getSession(); if (!session?.access_token) throw new Error("Session expirée."); const response = await fetch("/api/agent/profile", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }); const value = await response.json(); if (!response.ok) throw new Error(value.message ?? "Profil indisponible."); setProfile(value); } catch (cause) { setError(cause instanceof Error ? cause.message : "Profil indisponible."); } })(); }, []);
  if (!profile) return <main className="grid min-h-screen place-items-center bg-ebe-night text-white">{error ? <p role="alert" className="text-red-200">{error}</p> : <LoaderCircle className="h-7 w-7 animate-spin text-accent"/>}</main>;
  const initials = profile.nom.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const profilePhoto = getAgentProfilePhoto(profile.id);
  const professionalInformation = [["Nom complet", profile.nom], ["Email", profile.email], ["Agence", profile.site], ["Rôle", "Agent"], ["Statut du compte", "ACTIF"], ["Identifiant Agent", profile.id], ["Dernière connexion", profile.lastSignInAt ? new Date(profile.lastSignInAt).toLocaleString("fr-FR") : "Non disponible"]];
  const personalInformation = [["Numéro WhatsApp", UNAVAILABLE_PERSONAL_INFORMATION], ["Date de naissance", UNAVAILABLE_PERSONAL_INFORMATION], ["Situation matrimoniale", UNAVAILABLE_PERSONAL_INFORMATION]];
  const informationList = (items: string[][]) => <dl className="mt-4 grid gap-4 sm:grid-cols-2">{items.map(([label,value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-2 break-all font-semibold">{value}</dd></div>)}</dl>;
  return <main className="min-h-screen bg-ebe-night py-8 text-white"><div className="mx-auto max-w-3xl px-4"><a href="/agent" className="text-sm font-semibold text-accent">← Retour au tableau de bord</a><h1 className="mt-3 text-3xl font-semibold">Mon profil</h1><GlassPanel className="mt-8 p-6 sm:p-8"><div className="flex flex-col gap-6 sm:flex-row sm:items-center">{profilePhoto ? <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-accent/40"><Image src={profilePhoto} alt={`Photo de profil de ${profile.nom}`} fill sizes="96px" className="object-cover" priority /></div> : <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/15 text-3xl font-bold text-accent" aria-label={`Avatar ${initials}`}><span>{initials || <UserRound/>}</span></div>}<div><h2 className="text-2xl font-semibold">{profile.nom}</h2><p className="mt-1 text-muted-foreground">{profile.email}</p></div></div><section className="mt-8"><h3 className="text-lg font-semibold text-accent">Informations professionnelles</h3>{informationList(professionalInformation)}</section><section className="mt-8"><h3 className="text-lg font-semibold text-accent">Informations personnelles</h3>{informationList(personalInformation)}<p className="mt-3 text-xs text-muted-foreground">Ces informations ne sont pas encore configurées dans le profil Agent.</p></section><p className="mt-6 text-xs text-muted-foreground">Ce profil personnel est protégé, disponible en lecture seule et visible uniquement par l’Agent authentifié.</p></GlassPanel></div></main>;
}
