import Image from "next/image";

import styles from "./parcel-label.module.css";

export type ParcelLabelData = {
  visibleQrNumber: string;
  qrId: string;
  qrImageSrc: string;
  qrUrl: string;
  overlayLogo?: boolean;
};

export function ParcelLabel({ data }: { data: ParcelLabelData }) {
  return (
    <article className={styles.label} aria-label={`Étiquette colis ${data.qrId}`}>
      <header className={styles.header}>
        <div className={styles.logoPanel}>
          <Image
            className={styles.logo}
            src="/brand/eben-ezer-business-logo.png"
            alt="Eben Ezer Business"
            width={665}
            height={375}
            priority
          />
        </div>
        <div className={styles.headerCopy}>
          <p>Bon d’expédition</p>
          <h1>Étiquette colis</h1>
          <span>www.ebenezerbusiness.com</span>
        </div>
        <div className={styles.headerIdentity}>
          <span>Référence QR</span>
          <strong>{data.qrId}</strong>
        </div>
      </header>

      <div className={styles.labelBody}>
        <section className={styles.manualFields} aria-label="Champs à remplir manuellement">
          <div className={`${styles.manualField} ${styles.fullField}`}>
            <p className={styles.fieldLabel}>Bénéficiaire</p>
            <span className={styles.writeLine} aria-label="Champ Bénéficiaire vide" />
          </div>

          <div className={styles.twoColumnFields}>
            <div className={styles.manualField}>
              <p className={styles.fieldLabel}>Destination</p>
              <span className={styles.writeLine} aria-label="Champ Destination vide" />
            </div>
            <div className={styles.manualField}>
              <p className={styles.fieldLabel}>Code</p>
              <span className={styles.writeLine} aria-label="Champ Code vide" />
            </div>
          </div>

          <div className={styles.twoColumnFields}>
            <div className={styles.manualField}>
              <p className={styles.fieldLabel}>Numéro</p>
              <span className={styles.writeLine} aria-label="Champ Numéro vide" />
            </div>
            <div className={styles.manualField}>
              <p className={styles.fieldLabel}>Poids</p>
              <span className={styles.writeLine} aria-label="Champ Poids vide" />
            </div>
          </div>

          <div className={styles.contactPanel}>
            <div className={styles.contactNumbers}>
              <p className={styles.contactLabel}>Contacts officiels</p>
              <p className={styles.contacts}>+2290196158241&nbsp;&nbsp; • &nbsp;&nbsp;+229 0197471459</p>
            </div>
            <div className={styles.digitalContact}>
              <p className={styles.contactSite}>www.ebenezerbusiness.com</p>
              <div className={styles.socialLine} aria-label="TikTok et YouTube Eben Ezer Business Chez Vanela">
                <span className={styles.socialIcon} aria-label="TikTok">
                  <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                    <path d="M14.4 3.1c.5 2.6 1.9 4.1 4.5 4.4v3.1a8.8 8.8 0 0 1-4.5-1.4v6.2a6.2 6.2 0 1 1-5.3-6.1v3.2a3.1 3.1 0 1 0 2.2 3V3.1h3.1Z" />
                  </svg>
                </span>
                <span className={`${styles.socialIcon} ${styles.youtubeIcon}`} aria-label="YouTube">
                  <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                    <path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z" />
                  </svg>
                </span>
                <span className={styles.socialName}>Eben Ezer Business Chez Vanela</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.qrSection} aria-label={`Identification QR ${data.visibleQrNumber}`}>
          <p className={styles.scanTitle}>Scannez pour suivre</p>
          <div className={styles.qrFrame}>
            <Image
              className={styles.qrImage}
              src={data.qrImageSrc}
              alt={`QR ${data.visibleQrNumber} — ${data.qrUrl}`}
              width={1042}
              height={1132}
              priority
              unoptimized
            />
            {data.overlayLogo ? (
              <span className={styles.qrLogoOverlay} aria-hidden="true">
                <Image src="/brand/eben-ezer-business-logo.png" alt="" width={665} height={375} unoptimized />
              </span>
            ) : null}
          </div>
          <div className={styles.qrIdentity}>
            <span>QR visible</span>
            <strong>{data.visibleQrNumber}</strong>
          </div>
          <p className={styles.qrId}>{data.qrId}</p>
        </section>
      </div>

      <footer className={styles.footer}>
        <span>FIABILITÉ</span>
        <span className={styles.footerDot} aria-hidden="true" />
        <span>RAPIDITÉ</span>
        <span className={styles.footerDot} aria-hidden="true" />
        <span>SÉCURITÉ</span>
      </footer>
    </article>
  );
}
