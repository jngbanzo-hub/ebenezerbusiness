"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TRANSFER_CURRENCIES, type TransferAgency, type TransferSummary } from "./types";
import { agencyCircuits, finalizedTransfers, type HistoryFilters, type HistoryPeriod } from "./agent-transfer-history";

const initialFilters: HistoryFilters = { period: "THIS_MONTH", from: "", to: "", circuit: "", currency: "" };
const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Porto-Novo", dateStyle: "short", timeStyle: "short" });
function displayDate(value: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : "Non renseignée";
}

export function AgentTransferHistoryPanel({ transfers, agency, onSelect }: {
  transfers: TransferSummary[]; agency: TransferAgency; onSelect: (id: string) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const invalid = filters.period === "CUSTOM" && (!filters.from || !filters.to || filters.from > filters.to);
  const history = finalizedTransfers(transfers, agency, filters);
  const field = "mt-1 min-h-11 w-full rounded border border-white/20 bg-ebe-night px-2";
  const update = (key: keyof HistoryFilters, value: string) => setFilters(previous => ({ ...previous, [key]: value }));
  const card = (row: TransferSummary) => (
    <article key={row.transferId} className="rounded-lg border border-white/10 p-4">
      <p className="font-semibold">{row.maskedCode || "Code masqué"} · TRANSFERT FINALISÉ</p>
      <p>{row.agencyFrom} → {row.agencyTo} · {row.amount.toLocaleString("fr-FR")} {row.currency}</p>
      <p>Retrait : {displayDate(row.fundsWithdrawnAt)}</p>
      <p>Finalisation : {displayDate(row.confirmedAt)}</p>
      <Button type="button" variant="outline" className="mt-3" onClick={() => onSelect(row.transferId)}>Voir les détails</Button>
    </article>
  );
  return <section className="space-y-4" aria-label="Historique des retraits finalisés">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label>Période<select className={field} value={filters.period} onChange={event => update("period", event.target.value as HistoryPeriod)}>
        <option value="TODAY">Aujourd’hui</option><option value="THIS_WEEK">Cette semaine</option>
        <option value="THIS_MONTH">Ce mois</option><option value="CUSTOM">Période personnalisée</option>
      </select></label>
      {filters.period === "CUSTOM" && <>
        <label>Date de début<input className={field} type="date" value={filters.from} onChange={event => update("from", event.target.value)} /></label>
        <label>Date de fin<input className={field} type="date" value={filters.to} onChange={event => update("to", event.target.value)} /></label>
      </>}
      <label>Circuit<select className={field} value={filters.circuit} onChange={event => update("circuit", event.target.value)}>
        <option value="">Tous les circuits autorisés</option>
        {agencyCircuits(agency, true).map(circuit => <option key={circuit} value={circuit}>{circuit.replace(">", " → ")}</option>)}
      </select></label>
      {<label>Devise<select className={field} value={filters.currency} onChange={event => update("currency", event.target.value)}>
        <option value="">Toutes les devises</option>{TRANSFER_CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}
      </select></label>}
    </div>
    {invalid ? <p role="status">Choisissez une période complète, avec une fin égale ou postérieure au début.</p> : <>
      <p className="text-sm text-muted-foreground">Finalisations de la période, selon les transferts retournés. Dates à Porto-Novo.</p>
      <div className="grid gap-3 lg:grid-cols-2">{history.dated.map(card)}</div>
      {!history.dated.length && <p>Aucune finalisation datée ne correspond aux filtres.</p>}

    </>}
  </section>;
}
