"use client";

import { type FormEvent, useRef, useState } from "react";
import { Banknote, LoaderCircle } from "lucide-react";

import { GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { OpeningBalanceRequestError, submitOpeningBalance } from "./cash-opening-balance-client";

const AGENCIES = ["FIH", "LSHI", "KLZ"] as const;
type Agency = (typeof AGENCIES)[number];
type FormState = { amount: string; businessDate: string; observation: string; requestId: string; confirmed: boolean };
const empty = (): FormState => ({ amount: "", businessDate: "", observation: "", requestId: "", confirmed: false });

export function CashOpeningBalanceSection({ accessToken }: { accessToken: string }) {
  return <section className="mt-8"><h2 className="text-2xl font-semibold">Soldes initiaux des caisses</h2><p className="mt-2 text-sm text-muted-foreground">Saisie Admin unique et définitive. Aucun compte COO.</p><div className="mt-5 grid gap-5 xl:grid-cols-3">{AGENCIES.map((agency) => <OpeningBalanceForm key={agency} agency={agency} accessToken={accessToken} />)}</div></section>;
}

function OpeningBalanceForm({ agency, accessToken }: { agency: Agency; accessToken: string }) {
  const [form, setForm] = useState<FormState>(empty);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !form.businessDate || !form.requestId.trim() || !form.confirmed) { setFeedback({ ok: false, text: "Montant, date métier, requestId et confirmation sont obligatoires." }); return; }
    if (!window.confirm(`Valider définitivement le solde initial ${amount.toFixed(2)} USD pour ${agency} ?`)) return;
    lock.current = true; setSubmitting(true); setFeedback(null);
    try {
      const result = await submitOpeningBalance(accessToken, { agency, amount, businessDate: form.businessDate, observation: form.observation.trim() || undefined, requestId: form.requestId.trim(), confirmationFinal: true });
      setFeedback({ ok: true, text: result.replayed ? `Résultat idempotent rejoué : ${result.amount.toFixed(2)} USD.` : `Solde initial validé : ${result.amount.toFixed(2)} USD. Compte activé.` });
      if (!result.replayed) setForm(empty());
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof OpeningBalanceRequestError ? error.message : "La validation du solde initial a échoué." });
    } finally { lock.current = false; setSubmitting(false); }
  }
  const inputClass = "h-10 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-white outline-none focus:border-accent";
  return <GlassPanel className="p-5" glow="growth"><div className="flex items-center gap-3"><Banknote className="h-5 w-5 text-accent"/><h3 className="text-lg font-semibold">Caisse {agency}</h3></div><form className="mt-5 grid gap-4" onSubmit={submit}>
    <label className="grid gap-2 text-sm">Montant initial (USD)<input className={inputClass} type="number" min="0.01" step="0.01" value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})} required /></label>
    <label className="grid gap-2 text-sm">Date métier<input className={inputClass} type="date" value={form.businessDate} onChange={(e)=>setForm({...form,businessDate:e.target.value})} required /></label>
    <label className="grid gap-2 text-sm">Request ID<input className={inputClass} value={form.requestId} onChange={(e)=>setForm({...form,requestId:e.target.value})} autoComplete="off" required /></label>
    <label className="grid gap-2 text-sm">Observation facultative<textarea className="min-h-20 rounded-lg border border-white/15 bg-white/[0.05] p-3 text-white outline-none focus:border-accent" maxLength={500} value={form.observation} onChange={(e)=>setForm({...form,observation:e.target.value})}/></label>
    <label className="flex gap-3 text-sm"><input type="checkbox" checked={form.confirmed} onChange={(e)=>setForm({...form,confirmed:e.target.checked})} required/><span>Je confirme définitivement ce solde initial.</span></label>
    {feedback ? <p role="status" className={feedback.ok ? "text-sm text-emerald-200" : "text-sm text-red-200"}>{feedback.text}</p> : null}
    <Button type="submit" variant="growth" disabled={submitting || !form.confirmed}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin"/> : null}{submitting ? "Validation…" : `Valider ${agency}`}</Button>
  </form></GlassPanel>;
}
