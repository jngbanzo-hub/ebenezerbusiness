"use client";

import { Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { loadAgentTransferDetail } from "@/features/transferts/api";
import type { TransferSummary } from "@/features/transferts/types";

export function AgentTransferDetails({
  token,
  transferId,
  onClose
}: {
  token: string;
  transferId: string;
  onClose: () => void;
}) {
  const [transfer, setTransfer] = useState<TransferSummary | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void loadAgentTransferDetail(token, transferId, controller.signal)
      .then((result) => {
        if (active) setTransfer(result.transfer);
      })
      .catch((caught) => {
        if (active && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Détail indisponible.");
        }
      });
    return () => {
      active = false;
      controller.abort();
      setTransfer(null);
      setShowCode(false);
    };
  }, [token, transferId]);

  const close = () => {
    setTransfer(null);
    setShowCode(false);
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true">
      <GlassPanel className="mx-auto max-w-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Détail sécurisé du transfert</h2>
          <Button type="button" size="sm" variant="outline" onClick={close} aria-label="Fermer le détail">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {!transfer && !error ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Chargement sécurisé…
          </p>
        ) : error ? (
          <p role="alert" className="mt-6 text-sm text-amber-100">{error}</p>
        ) : transfer ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Item label="Transfer ID" value={transfer.transferId} />
              <Item label="Circuit" value={`${transfer.agencyFrom} → ${transfer.agencyTo}`} />
              <Item label="Agence expéditrice" value={transfer.agencyFrom} />
              <Item label="Agence bénéficiaire" value={transfer.agencyTo} />
              <Item label="Expéditeur" value={transfer.senderName} />
              <Item label="Bénéficiaire" value={transfer.beneficiaryName} />
              <Item label="Téléphone bénéficiaire" value={transfer.beneficiaryPhone || "—"} />
              <Item label="Service" value={transfer.service} />
              <Item label="Montant" value={`${transfer.amount} ${transfer.currency}`} />
              <Item label="Frais" value={`${transfer.fees} ${transfer.currency}`} />
              <Item label="Observation" value={transfer.observation || "—"} />
              <Item label="Statut" value={transfer.status} />
              <Item label="Date et heure" value={transfer.sentAt} />
            </div>
            <div className="rounded-lg border border-white/10 p-4">
              <p className="text-sm text-muted-foreground">Code du transfert</p>
              <div className="mt-2 flex items-center gap-3">
                <p className="font-mono text-lg">{showCode ? transfer.transferCode ?? transfer.maskedCode : transfer.maskedCode}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowCode((value) => !value)}>
                  {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showCode ? "Masquer le code" : "Afficher le code"}
                </Button>
              </div>
            </div>
            <Timeline transfer={transfer} />
          </div>
        ) : null}
      </GlassPanel>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | number }) {
  return <p><span className="text-muted-foreground">{label} :</span> {value || "—"}</p>;
}

function Timeline({ transfer }: { transfer: TransferSummary }) {
  const events = [
    ["Envoi", transfer.sentAt],
    ["Code reçu", transfer.codeReceivedAt],
    ["Fonds retirés", transfer.fundsWithdrawnAt],
    ["Confirmation", transfer.confirmedAt],
    ["Dernière mise à jour", transfer.updatedAt]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <div>
      <h3 className="font-semibold">Chronologie</h3>
      <ol className="mt-3 space-y-2 text-sm">
        {events.map(([label, date]) => <li key={`${label}-${date}`}><span className="text-muted-foreground">{label}</span> · {date}</li>)}
      </ol>
    </div>
  );
}
