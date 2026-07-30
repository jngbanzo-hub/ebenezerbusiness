"use client";

import { Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import {
  correctAdminTransferCode,
  loadAdminTransferDetail
} from "@/features/transferts/api";
import type { TransferSummary } from "@/features/transferts/types";

export function AdminTransferDetails({
  token,
  transferId,
  onClose,
  onSuccess
}: {
  token: string;
  transferId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [transfer, setTransfer] = useState<TransferSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [pending, setPending] = useState(false);
  const [correctionRequestId, setCorrectionRequestId] = useState(() => crypto.randomUUID());
  const [writesEnabled, setWritesEnabled] = useState(false);

  const load = () => {
    setLoading(true);
    return loadAdminTransferDetail(token, transferId)
      .then((result) => {
        setTransfer(result.transfer);
        setWritesEnabled(result.writesEnabled === true);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Détail indisponible."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadAdminTransferDetail(token, transferId)
      .then((result) => {
        if (active) {
          setTransfer(result.transfer);
          setWritesEnabled(result.writesEnabled === true);
        }
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Détail indisponible."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; setTransfer(null); };
  }, [token, transferId]);

  const canCorrect = Boolean(
    writesEnabled &&
    transfer &&
    ["ENVOYE", "CODE_RECU", "A_VERIFIER"].includes(transfer.status) &&
    !(transfer.status === "A_VERIFIER" && transfer.fundsWithdrawnAt)
  );
  const close = () => {
    setTransfer(null);
    setShowForm(false);
    setShowCode(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true">
      <GlassPanel className="mx-auto max-w-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Détail administratif</h2>
          <Button type="button" size="sm" variant="outline" onClick={close}><X className="h-4 w-4" /></Button>
        </div>
        {loading ? <LoaderCircle className="mt-6 h-5 w-5 animate-spin" /> : error ? (
          <p role="alert" className="mt-6 text-sm text-amber-100">{error}</p>
        ) : transfer ? (
          <div className="mt-6 space-y-5 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <Item label="Transfer ID" value={transfer.transferId} />
              <Item label="Circuit" value={`${transfer.agencyFrom} → ${transfer.agencyTo}`} />
              <Item label="Expéditeur" value={transfer.senderName} />
              <Item label="Bénéficiaire" value={transfer.beneficiaryName} />
              <Item label="Téléphone" value={transfer.beneficiaryPhone || "—"} />
              <Item label="Service" value={transfer.service} />
              <Item label="Montant" value={`${transfer.amount} ${transfer.currency}`} />
              <Item label="Frais" value={`${transfer.fees} ${transfer.currency}`} />
              <Item label="Code" value={transfer.maskedCode} />
              <Item label="Statut" value={transfer.status} />
              <Item label="Date" value={transfer.sentAt} />
              <Item label="Observation" value={transfer.observation || "—"} />
            </div>
            {canCorrect && !showForm ? (
              <Button type="button" onClick={() => setShowForm(true)}>Corriger le code</Button>
            ) : null}
            {canCorrect && showForm ? (
              <form
                className="space-y-3 rounded-lg border border-amber-200/20 p-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const formElement = event.currentTarget;
                  const data = new FormData(formElement);
                  setPending(true);
                  setError("");
                  try {
                    await correctAdminTransferCode(token, transfer.transferId, {
                      newTransferCode: String(data.get("newTransferCode")),
                      confirmTransferCode: String(data.get("confirmTransferCode")),
                      motif: String(data.get("motif")),
                      correctionRequestId
                    });
                    formElement.reset();
                    setShowCode(false);
                    setShowForm(false);
                    setCorrectionRequestId(crypto.randomUUID());
                    await load();
                    onSuccess();
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "Correction impossible.");
                  } finally {
                    setPending(false);
                  }
                }}
              >
                <p className="text-amber-100">La correction du code peut obliger l’agence bénéficiaire à confirmer de nouveau la réception du code.</p>
                <label className="grid gap-1">Nouveau code<input name="newTransferCode" type={showCode ? "text" : "password"} required maxLength={128} className="field" /></label>
                <label className="grid gap-1">Confirmation<input name="confirmTransferCode" type={showCode ? "text" : "password"} required maxLength={128} className="field" /></label>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowCode((value) => !value)}>
                  {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showCode ? "Masquer" : "Afficher"}
                </Button>
                <label className="grid gap-1">Motif<input name="motif" required maxLength={500} className="field" /></label>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>{pending ? "Correction…" : "Confirmer la correction"}</Button>
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setShowCode(false); }}>Annuler</Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </GlassPanel>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | number }) {
  return <p><span className="text-muted-foreground">{label} :</span> {value || "—"}</p>;
}
