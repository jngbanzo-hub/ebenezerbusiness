"use client";

import { Printer } from "lucide-react";

import styles from "./parcel-label.module.css";

export function PrintLabelButton({ label = "Imprimer l’étiquette A5" }: { label?: string }) {
  return (
    <button className={styles.printButton} type="button" onClick={() => window.print()}>
      <Printer aria-hidden="true" size={18} strokeWidth={2.2} />
      {label}
    </button>
  );
}
