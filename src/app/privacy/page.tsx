import type { Metadata } from "next";
import { Camera, LockKeyhole, Mail, MapPin, Phone, ShieldCheck, UserCheck } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { companyInfo, toTelHref } from "@/config/company";
import { HomeNavbar } from "@/features/home/home-navbar";
import { SiteFooter } from "@/features/home/site-footer";
import { createPageMetadata } from "@/lib/seo";

const lastUpdated = "22 juillet 2026";

export const metadata: Metadata = createPageMetadata({
  title: "Politique de confidentialité",
  description:
    "Politique de confidentialité de l'application mobile Eben Ezer Business pour les agents, le scan QR Code et le suivi des colis.",
  path: "/privacy"
});

const collectedData = [
  {
    icon: UserCheck,
    title: "Compte Agent",
    text: "L'application peut utiliser les informations nécessaires à l'identification d'un agent autorisé, notamment le nom du compte, le rôle, l'agence associée et les informations de connexion."
  },
  {
    icon: LockKeyhole,
    title: "Connexion sécurisée",
    text: "Les données d'authentification servent uniquement à vérifier l'accès aux espaces réservés et à protéger les opérations internes de suivi."
  },
  {
    icon: Camera,
    title: "Caméra et scan QR Code",
    text: "La caméra peut être utilisée pour scanner un QR Code de colis. L'accès à la caméra est limité à cette fonctionnalité et ne sert pas à enregistrer des images personnelles."
  },
  {
    icon: ShieldCheck,
    title: "Suivi des colis",
    text: "L'application traite les informations nécessaires au suivi opérationnel des colis, comme le code de suivi, le statut, la destination, le poids et les informations utiles à la livraison."
  }
] as const;

const privacyPrinciples = [
  "Les données sont utilisées uniquement pour le fonctionnement de l'application mobile Eben Ezer Business.",
  "Les informations ne sont pas vendues, louées ou revendues à des tiers.",
  "Les communications et les accès sont protégés par des mesures de sécurité adaptées aux usages de l'application.",
  "Les données sont consultées uniquement par les personnes autorisées dans le cadre des opérations logistiques.",
  "Les informations sont conservées uniquement pendant la durée nécessaire au suivi, à l'assistance et aux obligations opérationnelles."
] as const;

export default function PrivacyPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />

      <section className="relative border-b border-white/10 pb-14 pt-28 sm:pb-16 sm:pt-32">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(30,99,255,0.24),transparent_30rem),radial-gradient(circle_at_82%_18%,rgba(163,230,53,0.14),transparent_24rem)]"
        />
        <Container className="relative">
          <div className="max-w-3xl">
            <Badge variant="growth">Application mobile</Badge>
            <h1 className="mt-5 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
              Politique de confidentialité
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Cette page explique comment {companyInfo.name} traite les données utilisées par son
              application mobile dédiée aux opérations et au suivi des colis.
            </p>
            <p className="mt-4 text-sm font-medium text-[#D9FF83]">
              Dernière mise à jour : {lastUpdated}
            </p>
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-16">
        <Container className="grid gap-6 lg:grid-cols-[0.75fr_0.25fr]">
          <div className="grid gap-6">
            <GlassPanel className="p-6 sm:p-7" glow="blue">
              <Badge variant="premium">Données collectées</Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-normal text-white">
                Les informations nécessaires à l&apos;application
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {collectedData.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-white/10 bg-white/[0.035] p-4"
                  >
                    <item.icon className="h-5 w-5 text-accent" />
                    <h3 className="mt-3 text-base font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
                  </div>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel className="p-6 sm:p-7" glow="growth">
              <Badge variant="growth">Utilisation</Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-normal text-white">
                Une utilisation limitée au service logistique
              </h2>
              <ul className="mt-6 grid gap-3 text-sm leading-6 text-muted-foreground">
                {privacyPrinciples.map((principle) => (
                  <li key={principle} className="flex gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <span>{principle}</span>
                  </li>
                ))}
              </ul>
            </GlassPanel>

            <GlassPanel className="p-6 sm:p-7" glow="blue">
              <Badge variant="premium">Sécurité et confidentialité</Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-normal text-white">
                Protection des communications
              </h2>
              <div className="mt-5 grid gap-4 text-sm leading-7 text-muted-foreground">
                <p>
                  {companyInfo.name} met en place des mesures destinées à protéger les accès, les
                  communications et les données opérationnelles utilisées par l&apos;application.
                </p>
                <p>
                  Les informations affichées dans l&apos;application sont réservées au suivi des colis,
                  à l&apos;assistance client et aux opérations autorisées. Elles ne sont pas utilisées
                  pour de la publicité externe et ne sont pas revendues.
                </p>
                <p>
                  Si un utilisateur pense qu&apos;une information doit être corrigée ou supprimée, il
                  peut contacter l&apos;équipe officielle afin qu&apos;une vérification soit effectuée.
                </p>
              </div>
            </GlassPanel>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <GlassPanel className="p-5" glow="growth">
              <Badge variant="growth">Contact</Badge>
              <h2 className="mt-4 text-xl font-semibold tracking-normal text-white">
                Eben Ezer Business
              </h2>
              <div className="mt-5 grid gap-4 text-sm text-muted-foreground">
                <a href={`mailto:${companyInfo.email}`} className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <span>{companyInfo.email}</span>
                </a>
                <a href={toTelHref(companyInfo.phones[0])} className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <span>{companyInfo.phones[0]}</span>
                </a>
                <a
                  href={companyInfo.primaryWhatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-3"
                >
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <span>WhatsApp : {companyInfo.primaryWhatsappNumber}</span>
                </a>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <span>Cotonou, Bénin - RDC</span>
                </div>
              </div>
            </GlassPanel>
          </aside>
        </Container>
      </section>

      <SiteFooter />
    </main>
  );
}
