"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Info, PackageCheck, Search } from "lucide-react";

import {
  Container,
  DestinationCard,
  GlassPanel,
  SectionHeader,
  ServiceCard,
  StatCard
} from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { companyInfo } from "@/config/company";
import { BrandLogo } from "@/features/home/brand-logo";
import { HomeNavbar } from "@/features/home/home-navbar";
import { HeroLogisticsVisual } from "@/features/home/hero-logistics-visual";
import { HeroStatCounter } from "@/features/home/hero-stat-counter";
import { SiteFooter } from "@/features/home/site-footer";
import { advantages, destinations, services, stats } from "@/features/home/home-data";
import { ParcelTracking } from "@/features/tracking/parcel-tracking";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 }
};

export function HomePage() {
  const shouldReduceMotion = useReducedMotion();
  const heroLogoLoop = shouldReduceMotion
    ? { opacity: 1, scale: 1, y: 0 }
    : {
        opacity: 1,
        scale: [1, 1.022, 1],
        y: [0, -7, 0]
      };
  const heroLogoHaloLoop = shouldReduceMotion
    ? { opacity: 0.58, scale: 1 }
    : {
        opacity: [0.42, 0.74, 0.42],
        scale: [0.96, 1.08, 0.96]
      };

  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />

      <section
        id="accueil"
        className="relative border-b border-white/10 bg-[linear-gradient(180deg,rgba(6,17,31,0.45),#06111F_76%)] pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24"
      >
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(30,99,255,0.25),transparent_30rem),radial-gradient(circle_at_82%_20%,rgba(163,230,53,0.14),transparent_26rem)]"
          animate={
            shouldReduceMotion
              ? { scale: 1, opacity: 0.82 }
              : { scale: [1, 1.035, 1], opacity: [0.72, 1, 0.72] }
          }
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 10, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-ebe-electric opacity-70"
        />
        <Container className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="relative text-center"
          >
            <Badge variant="growth">Agence de Fret Bénin - RDC</Badge>
            <h1 className="sr-only">{companyInfo.name}</h1>
            <motion.div
              className="relative mx-auto mt-8 flex w-full max-w-[640px] justify-center rounded-2xl p-2 sm:p-3"
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: 12 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
            >
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 rounded-[1.65rem] bg-[radial-gradient(circle_at_35%_28%,rgba(56,189,248,0.42),transparent_34%),radial-gradient(circle_at_70%_60%,rgba(163,230,53,0.34),transparent_36%)] blur-2xl"
                animate={heroLogoHaloLoop}
                transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="relative z-10 w-full rounded-2xl"
                animate={heroLogoLoop}
                transition={{ duration: 7.8, repeat: Infinity, ease: "easeInOut" }}
                style={{ willChange: shouldReduceMotion ? "auto" : "transform" }}
              >
                <motion.div
                  className="rounded-2xl"
                  animate={
                    shouldReduceMotion
                      ? {
                          boxShadow:
                            "0 0 0 1px rgba(255,255,255,0.10), 0 0 34px rgba(30,99,255,0.18)"
                        }
                      : {
                          boxShadow: [
                            "0 0 0 1px rgba(255,255,255,0.10), 0 0 34px rgba(30,99,255,0.18)",
                            "0 0 0 1px rgba(56,189,248,0.25), 0 0 64px rgba(163,230,53,0.24)",
                            "0 0 0 1px rgba(255,255,255,0.10), 0 0 34px rgba(30,99,255,0.18)"
                          ]
                        }
                  }
                  transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut" }}
                >
                  <BrandLogo
                    priority
                    surface="dark"
                    className="w-full p-3 sm:p-4"
                    imageClassName="h-auto w-full"
                  />
                </motion.div>
              </motion.div>
            </motion.div>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Votre partenaire de confiance pour le transport de colis entre le Bénin et la
              République Démocratique du Congo.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                asChild
                variant="growth"
                size="lg"
                className="group shadow-lime hover:shadow-[0_0_0_1px_rgba(163,230,53,0.35),0_24px_70px_rgba(163,230,53,0.24)]"
              >
                <Link href="/contact">
                  <PackageCheck className="h-5 w-5" />
                  Expédier un colis
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="hover:shadow-[0_0_0_1px_rgba(30,99,255,0.30),0_22px_60px_rgba(30,99,255,0.18)]"
              >
                <Link href="#suivi">
                  <Search className="h-5 w-5" />
                  Suivre mon colis
                </Link>
              </Button>
            </div>
            <div className="mt-8 flex justify-center">
              <HeroStatCounter value={75000} label="Colis transportés" />
            </div>
          </motion.div>

          <HeroLogisticsVisual />
        </Container>
      </section>

      <section id="suivi" className="border-b border-white/10 py-14 sm:py-16">
        <Container>
          <ParcelTracking />
        </Container>
      </section>

      <section id="services" className="py-16 sm:py-20">
        <Container>
          <SectionHeader
            eyebrow="Services"
            title="Des solutions de transport pour chaque colis"
            description="Une offre claire pour expedition urgente, groupage, stockage et acheminement multimodal."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.title} {...service} />
            ))}
          </div>
        </Container>
      </section>

      <section id="destinations" className="border-y border-white/10 bg-white/[0.025] py-16 sm:py-20">
        <Container>
          <SectionHeader
            eyebrow="Destinations RDC"
            title="Un réseau pensé pour les grandes villes congolaises"
            description={`Depuis le Bénin, ${companyInfo.name} organise vos expeditions vers les principaux centres economiques de la RDC.`}
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {destinations.map((city, index) => (
              <DestinationCard
                key={city}
                city={city}
                country="RDC"
                route={`Cotonou -> ${city}`}
                status={index < 3 ? "Prioritaire" : "Actif"}
              />
            ))}
          </div>
          <div className="mx-auto mt-8 flex max-w-4xl flex-col items-center gap-3 rounded-lg border border-primary/20 bg-[linear-gradient(135deg,rgba(30,99,255,0.12),rgba(255,255,255,0.045))] px-5 py-5 text-center shadow-glow sm:flex-row sm:justify-center sm:px-7">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/15 text-[#AFC7FF]">
              <Info className="h-5 w-5" />
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              Les délais de livraison sont donnés à titre indicatif et peuvent varier en fonction
              des formalités douanières, des conditions de transport et des contraintes
              opérationnelles.
            </p>
          </div>
        </Container>
      </section>

      <section id="a-propos" className="py-16 sm:py-20">
        <Container>
          <SectionHeader
            eyebrow={`Pourquoi ${companyInfo.name}`}
            title="La rigueur d'un partenaire logistique professionnel"
            description="Chaque étape est pensée pour protéger les colis, clarifier les informations et rassurer les clients."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
            {advantages.map((advantage) => {
              const Icon = advantage.icon;

              return (
                <GlassPanel key={advantage.title} className="p-5" glow="none">
                  <div className="grid h-11 w-11 place-items-center rounded-md border border-accent/25 bg-accent/15 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold tracking-normal text-white">
                    {advantage.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {advantage.description}
                  </p>
                </GlassPanel>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-14 sm:py-16">
        <Container>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
                tone={index === 0 || index === 3 ? "growth" : "blue"}
              />
            ))}
          </div>
        </Container>
      </section>

      <section id="tarifs" className="py-16 sm:py-20">
        <Container>
          <GlassPanel className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <Badge variant="premium">Tarifs sur mesure</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Un devis clair avant chaque expedition
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Les tarifs dependent du poids, du volume, du delai et de la destination finale.
              </p>
            </div>
            <Button asChild variant="premium" size="lg">
              <Link href="/contact">
                Demander un devis
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </GlassPanel>
        </Container>
      </section>

      <SiteFooter />
    </main>
  );
}
