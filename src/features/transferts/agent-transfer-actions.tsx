"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { performAgentTransferAction } from "@/features/transferts/api";
import type { TransferAgency, TransferSummary } from "@/features/transferts/types";

export function AgentTransferActions({
  token,
  transfer,
  agency,
  enabled,
  onSuccess
}: {
  token: string;
  transfer: TransferSummary;
  agency: TransferAgency;
  enabled: boolean;
  onSuccess: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  if (!enabled) return null;
  const beneficiary = transfer.agencyTo === agency;
  const party = beneficiary || transfer.agencyFrom === agency;
  const actions = [
    beneficiary && ["ENVOYE", "A_VERIFIER"].includes(transfer.status) && ["confirm-code", "Confirmer réception du code"],
    beneficiary && ["CODE_RECU", "A_VERIFIER"].includes(transfer.status) && ["confirm-withdrawal", "Confirmer retrait"],
    party && ["FONDS_RETIRES", "A_VERIFIER"].includes(transfer.status) && ["confirm-transfer", "Confirmer le transfert"],
    party && ["ENVOYE", "CODE_RECU", "FONDS_RETIRES"].includes(transfer.status) && ["flag-review", "Signaler à vérifier"],
    party && ["ENVOYE", "CODE_RECU", "A_VERIFIER"].includes(transfer.status) && ["cancel", "Annuler"]
  ].filter(Boolean) as [Parameters<typeof performAgentTransferAction>[2], string][];

  if (!actions.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map(([action, label]) => (
        <Button
          key={action}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={async () => {
            const needsMotif = action === "flag-review" || action === "cancel";
            const motif = needsMotif ? window.prompt("Motif obligatoire :")?.trim() : "";
            if (needsMotif && !motif) return;
            if (!window.confirm(`Confirmer : ${label} ?`)) return;
            setPending(true);
            setMessage("");
            try {
              await performAgentTransferAction(token, transfer.transferId, action, needsMotif ? { motif } : {});
              setMessage("Opération enregistrée.");
              onSuccess();
            } catch (caught) {
              setMessage(caught instanceof Error ? caught.message : "Opération impossible.");
            } finally {
              setPending(false);
            }
          }}
        >{label}</Button>
      ))}
      {message && <p role="status" className="w-full text-sm text-amber-100">{message}</p>}
    </div>
  );
}
