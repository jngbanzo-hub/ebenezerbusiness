import type { Metadata } from "next";
import { DatabaseZap, ShieldCheck, Truck } from "lucide-react";

import { Container } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { companyInfo } from "@/config/company";
import { HomeNavbar } from "@/features/home/home-navbar";
import { SiteFooter } from "@/features/home/site-footer";
import { ParcelTracking } from "@/features/tracking/parcel-tracking";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Suivi de colis",
  description: `Suivez votre colis ${companyInfo.name} en toute sécurité avec votre Tracking ID.`,
  path: "/suivi-de-colis"
});

const trackingProofPoints = [
  { label: "Données vérifiées", icon: ShieldCheck },
  { label: "Mises à jour colis", icon: Truck },
  { label: "Accès sécurisé", icon: DatabaseZap }
] as const;

export default function TrackingRoutePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />

      <section className="relative border-b border-white/10 pb-14 pt-28 sm:pb-16 sm:pt-32 lg:pb-20">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(30,99,255,0.24),transparent_28rem),radial-gradient(circle_at_82%_18%,rgba(163,230,53,0.12),transparent_24rem),linear-gradient(180deg,rgba(6,17,31,0.3),#06111F_82%)]"
        />
        <Container className="relative">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-end">
            <div>
              <Badge variant="growth">Tracking Center</Badge>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-normal text-white sm:text-5xl lg:text-6xl">
                Suivi de colis Eben Ezer Business
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Consultez l&apos;état officiel de votre colis entre le Bénin et la RDC avec votre
                Tracking ID.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Route</p>
                  <p className="mt-1 text-2xl font-semibold tracking-normal text-white">
                    Bénin → RDC
                  </p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-lg border border-accent/25 bg-accent/15 text-accent">
                  <Truck className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {trackingProofPoints.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-ebe-night/65 px-3 py-2 text-xs font-semibold text-muted-foreground"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-accent" />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-6xl">
            <ParcelTracking />
          </div>
        </Container>
      </section>

      <SiteFooter />
    </main>
  );
}
