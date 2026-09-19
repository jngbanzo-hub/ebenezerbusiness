"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, MessageCircle, PackageCheck } from "lucide-react";

import { Container, GlassPanel, StatCard } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { companyInfo } from "@/config/company";
import { HomeNavbar } from "@/features/home/home-navbar";
import { SiteFooter } from "@/features/home/site-footer";
import { serviceAdvantages, serviceOfferings, serviceStats } from "@/features/services/services-data";

export function ServicesPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />

      <section className="relative border-b border-white/10 pb-14 pt-28 sm:pb-16 sm:pt-32">
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(30,99,255,0.25),transparent_30rem),radial-gradient(circle_at_82%_16%,rgba(163,230,53,0.14),transparent_24rem)]"
          animate={{ opacity: [0.75, 1, 0.75], scale: [1, 1.025, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <Container className="relative">
          <div className="max-w-3xl">
            <Badge variant="growth">Services logistiques</Badge>
            <h1 className="mt-6 text-balance font-display text-4xl font-semibold leading-tight tracking-normal text-white sm:text-6xl">
              Des solutions fiables pour chaque expédition
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              {companyInfo.name} accompagne vos colis entre le Bénin et la RDC avec des services
              rapides, sécurisés et adaptés à vos contraintes.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {serviceStats.map((stat, index) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
                tone={index === 0 ? "growth" : "blue"}
              />
            ))}
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-16">
        <Container>
          <div className="mb-10 max-w-3xl">
            <Badge variant="premium">Nos expertises</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              Tous les services {companyInfo.name}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Choisissez le service le plus adapté à votre colis, votre délai et votre destination.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {serviceOfferings.map((service) => (
              <ServiceOfferingCard key={service.title} service={service} />
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-14 sm:py-16">
        <Container>
          <div className="mb-10 max-w-3xl">
            <Badge variant="growth">Pourquoi choisir nos services ?</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              Une approche claire, sérieuse et rassurante
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {serviceAdvantages.map((advantage) => {
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

      <section className="py-14 sm:py-16">
        <Container>
          <GlassPanel className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center" glow="growth">
            <div>
              <Badge variant="premium">Accompagnement sur mesure</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Besoin d’un service logistique fiable ?
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Notre équipe vous aide à choisir le bon service selon le poids, le volume,
                l’urgence et la destination.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:flex">
              <Button asChild variant="growth" size="lg">
                <Link href="/contact">
                  <PackageCheck className="h-5 w-5" />
                  Demander un devis
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={companyInfo.primaryWhatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  Contacter sur WhatsApp
                </a>
              </Button>
            </div>
          </GlassPanel>
        </Container>
      </section>

      <SiteFooter />
    </main>
  );
}

type ServiceOffering = (typeof serviceOfferings)[number];

function ServiceOfferingCard({ service }: { service: ServiceOffering }) {
  const Icon = service.icon;

  return (
    <GlassPanel className="group flex h-full flex-col justify-between gap-8 p-5" glow="blue">
      <div>
        <div className="grid h-12 w-12 place-items-center rounded-md border border-primary/25 bg-primary/15 text-[#AFC7FF] shadow-glow">
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="mt-6 text-xl font-semibold tracking-normal text-white">{service.title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{service.description}</p>
      </div>
      <Button asChild variant="outline" className="w-full justify-between group-hover:border-accent/30 group-hover:text-white">
        <Link href="/contact">
          Demander ce service
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </GlassPanel>
  );
}
