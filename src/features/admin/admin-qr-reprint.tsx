"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { loadAdminQr, type AdminQrRecord } from "@/features/admin/admin-qr-client";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { ParcelLabel, type ParcelLabelData } from "@/features/qr-label/parcel-label";
import styles from "@/features/qr-label/parcel-label.module.css";
import { PrintLabelButton } from "@/features/qr-label/print-label-button";
import { createQrSvgDataUrl } from "@/features/qr-label/qr-svg";

export function AdminQrReprint({ selector }: { selector: string }) {
  const [record, setRecord] = useState<AdminQrRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void loadAdminQr(getSupabaseBrowserClient().auth, selector)
      .then((value) => { if (active) setRecord(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Accès Admin refusé."); });
    return () => { active = false; };
  }, [selector]);

  if (error) return <main className={styles.previewPage}><div className={styles.previewHeader}><div><h1 className={styles.previewTitle}>Réimpression indisponible</h1><p role="alert" className={styles.previewMeta}>{error}</p></div><Button asChild variant="outline"><Link href="/admin/qr-associations">Retour</Link></Button></div></main>;
  if (!record) return <main className={styles.previewPage}><div className={styles.previewHeader}><p className={styles.previewMeta}>Vérification de l’accès Admin et chargement du QR…</p></div></main>;
  if (record.label.status === "REVOKED") return <main className={styles.previewPage}><div className={styles.previewHeader}><div><h1 className={styles.previewTitle}>QR RÉVOQUÉ</h1><p role="alert" className={styles.previewMeta}>QR RÉVOQUÉ — RÉIMPRESSION OPÉRATIONNELLE INTERDITE</p></div><Button asChild variant="outline"><Link href="/admin/qr-associations">Retour</Link></Button></div></main>;

  const visibleQrNumber = String(record.label.display_number).padStart(3, "0");
  const qrUrl = `https://www.ebenezerbusiness.com/q/${record.label.qr_id}`;
  const data: ParcelLabelData = { visibleQrNumber, qrId: record.label.qr_id, qrUrl, qrImageSrc: createQrSvgDataUrl(qrUrl), overlayLogo: true };

  return <main className={styles.previewPage}>
    <div className={styles.previewHeader}><div><p className={styles.previewKicker}>Réimpression Admin • QR {visibleQrNumber}</p><h1 className={styles.previewTitle}>Aperçu de l’étiquette A5</h1><p className={styles.previewMeta}>Même identité QR existante • aucune réservation ni mutation</p></div><PrintLabelButton /></div>
    <div className={styles.previewCanvas}><ParcelLabel data={data} /></div>
  </main>;
}
