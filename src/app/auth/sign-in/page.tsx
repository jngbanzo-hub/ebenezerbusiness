import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { companyInfo } from "@/config/company";
import { HomeNavbar } from "@/features/home/home-navbar";
import { SiteFooter } from "@/features/home/site-footer";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Connexion",
  description: `Accès sécurisé à l'espace professionnel ${companyInfo.name}.`,
  path: "/auth/sign-in",
  noIndex: true
});

export default function SignInPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />

      <section className="relative border-b border-white/10 pb-16 pt-28 sm:pb-20 sm:pt-32">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(30,99,255,0.24),transparent_30rem),radial-gradient(circle_at_82%_20%,rgba(163,230,53,0.14),transparent_24rem)]"
        />
        <Container className="relative">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="growth">Espace sécurisé</Badge>
            <div className="mx-auto mt-8 grid h-16 w-16 place-items-center rounded-xl border border-accent/25 bg-accent/15 text-accent shadow-lime">
              <LockKeyhole className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
              Connexion
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              L&apos;espace professionnel sera activé lors de la mise en place du module ERP. Pour
              toute demande urgente, contactez directement notre équipe officielle.
            </p>
          </div>

          <GlassPanel className="mx-auto mt-10 max-w-3xl p-5 sm:p-6" glow="growth">
            <div className="grid gap-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <div className="grid h-12 w-12 place-items-center rounded-lg border border-primary/25 bg-primary/15 text-[#AFC7FF]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-normal text-white">
                  Accès en préparation
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Le site public reste disponible pour les tarifs, les contacts et le suivi de
                  colis.
                </p>
              </div>
              <Button asChild variant="growth" size="lg">
                <a href={companyInfo.primaryWhatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  WhatsApp
                </a>
              </Button>
            </div>
          </GlassPanel>

          <div className="mt-8 text-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          </div>
        </Container>
      </section>

      <SiteFooter />
    </main>
  );
}
