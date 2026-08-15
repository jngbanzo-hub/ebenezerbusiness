import type { Metadata } from "next";
import { AlertCircle, CheckCircle2, QrCode, ShieldX } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { HomeNavbar } from "@/features/home/home-navbar";
import { SiteFooter } from "@/features/home/site-footer";
import { TrackingResultCard } from "@/features/tracking/parcel-tracking";
import { resolvePublicQr, type PublicQrResolution } from "@/server/public-qr-resolver";

export const metadata: Metadata = {
  title: "QR colis",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicQrPage({ params }: { params: { qrId: string } }) {
  const resolution = await resolvePublicQr(params.qrId);

  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />
      <section className="relative border-b border-white/10 pb-14 pt-28 sm:pb-16 sm:pt-32">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(30,99,255,0.24),transparent_28rem),radial-gradient(circle_at_82%_18%,rgba(163,230,53,0.12),transparent_24rem)]"
        />
        <Container className="relative max-w-6xl">
          <Badge variant="growth">QR officiel</Badge>
          <h1 className="mt-5 text-4xl font-semibold sm:text-5xl">Suivi de colis Eben Ezer Business</h1>
          <p className="mt-3 font-mono text-sm text-muted-foreground">{params.qrId}</p>
          {resolution.state === "ASSIGNED" ? (
            <TrackingResultCard result={resolution.result} />
          ) : (
            <PublicQrState resolution={resolution} />
          )}
        </Container>
      </section>
      <SiteFooter />
    </main>
  );
}

function PublicQrState({ resolution }: { resolution: PublicQrResolution }) {
  const content = getPublicContent(resolution.state);
  const Icon = content.icon;

  return (
    <GlassPanel className="mt-8 p-6 sm:p-8" glow={content.glow}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-accent">
          <Icon className="h-7 w-7" />
        </div>
        <div>
          <p className="text-xl font-semibold text-white">{content.title}</p>
          <p className="mt-2 leading-7 text-muted-foreground">{content.message}</p>
        </div>
      </div>
    </GlassPanel>
  );
}

function getPublicContent(state: PublicQrResolution["state"]) {
  if (state === "UNASSIGNED") {
    return {
      title: "QR officiel reconnu",
      message: "QR Eben Ezer Business valide — association au colis en attente.",
      icon: CheckCircle2,
      glow: "growth" as const
    };
  }
  if (state === "REVOKED") {
    return {
      title: "QR indisponible",
      message: "Ce QR Eben Ezer Business n’est pas utilisable.",
      icon: ShieldX,
      glow: "none" as const
    };
  }
  if (state === "UNAVAILABLE") {
    return {
      title: "Service temporairement indisponible",
      message: "Veuillez réessayer dans quelques instants.",
      icon: AlertCircle,
      glow: "none" as const
    };
  }
  return {
    title: "QR non reconnu",
    message: "Ce QR ne correspond pas à un QR Eben Ezer Business utilisable.",
    icon: QrCode,
    glow: "none" as const
  };
}
