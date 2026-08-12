"use client";

import { Bell, CheckCheck, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";

type Item = { id: string; type: string; title: string; message: string; agency: string; actorName: string; occurredAt: string; read: boolean };

export function NotificationBell({ href }: { href: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => { void request("/api/notifications?filter=unread").then((value) => setCount(Number(value.unreadCount ?? 0))).catch(() => undefined); }, []);
  return <Button asChild type="button" variant="outline"><a href={href} aria-label={`Notifications${count ? `, ${count} non lues` : ""}`}><Bell className="h-4 w-4"/>Notifications{count > 0 ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-ebe-night">{count}</span> : null}</a></Button>;
}

export function NotificationCenter({ backHref }: { backHref: string }) {
  const [items, setItems] = useState<Item[]>([]), [filter, setFilter] = useState<"all" | "unread">("all"), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const value = await request(`/api/notifications?filter=${filter}`); setItems(Array.isArray(value.notifications) ? value.notifications as Item[] : []); } catch { setError("Impossible de charger les notifications."); } finally { setLoading(false); } }, [filter]);
  useEffect(() => { void load(); }, [load]);
  async function mark(notificationId?: string) { await request("/api/notifications", { method: "POST", body: JSON.stringify({ action: notificationId ? "MARK_READ" : "MARK_ALL_READ", notificationId }) }); await load(); }
  return <main className="min-h-screen bg-ebe-night py-8 text-white"><div className="mx-auto max-w-5xl px-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><a href={backHref} className="text-sm font-semibold text-accent">← Retour au tableau de bord</a><h1 className="mt-3 text-3xl font-semibold">Notifications</h1><p className="mt-2 text-sm text-muted-foreground">Événements opérationnels de votre périmètre autorisé.</p></div><Button variant="outline" onClick={() => void mark()}><CheckCheck className="h-4 w-4"/>Tout marquer comme lu</Button></div><div className="mt-6 flex gap-3"><Button variant={filter === "all" ? "growth" : "outline"} onClick={() => setFilter("all")}>Toutes</Button><Button variant={filter === "unread" ? "growth" : "outline"} onClick={() => setFilter("unread")}>Non lues</Button></div>{loading ? <LoaderCircle className="mx-auto mt-12 h-7 w-7 animate-spin text-accent"/> : error ? <p role="alert" className="mt-8 text-red-200">{error}</p> : items.length === 0 ? <GlassPanel className="mt-8 p-8 text-center text-muted-foreground">Aucune notification.</GlassPanel> : <div className="mt-6 space-y-3">{items.map((item) => <GlassPanel key={item.id} className={`p-5 ${item.read ? "opacity-70" : "border-accent/35"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-accent">{item.type} · {item.agency}</p><h2 className="mt-1 font-semibold">{item.title}</h2><p className="mt-2 text-sm text-muted-foreground">{item.message}</p><p className="mt-3 text-xs text-muted-foreground">{item.actorName} · {new Date(item.occurredAt).toLocaleString("fr-FR")}</p></div>{item.read ? <span className="text-xs text-muted-foreground">Lu</span> : <Button size="sm" variant="outline" onClick={() => void mark(item.id)}>Marquer comme lu</Button>}</div></GlassPanel>)}</div>}</div></main>;
}

async function request(url: string, init?: RequestInit) {
  if (init?.method && init.method !== "GET") {
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
    if (!session?.access_token) throw new Error("Votre session a expiré. Veuillez vous reconnecter.");
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, cache: "no-store" });
    return readJsonOrThrow<Record<string, unknown>>(response, "Notifications indisponibles.");
  }
  const response = await authenticatedRead(getSupabaseBrowserClient().auth, url, init);
  return readJsonOrThrow<Record<string, unknown>>(response, "Notifications indisponibles.");
}
