"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeDollarSign,
  Info,
  MapPin,
  MessageCircle,
  PackageCheck,
  Search
} from "lucide-react";
import { useMemo, useState } from "react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { companyInfo } from "@/config/company";
import { HomeNavbar } from "@/features/home/home-navbar";
import { SiteFooter } from "@/features/home/site-footer";
import {
  popularPricingDestinations,
  pricingDestinations,
  type PricingDestination
} from "@/features/pricing/pricing-data";

export function PricingPage() {
  const [query, setQuery] = useState("");
  const filteredDestinations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return pricingDestinations;
    }

    return pricingDestinations.filter((destination) =>
      destination.city.toLowerCase().includes(normalizedQuery)
    );
  }, [query]);

  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />

      <section className="relative border-b border-white/10 pb-14 pt-28 sm:pb-16 sm:pt-32">
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(30,99,255,0.24),transparent_30rem),radial-gradient(circle_at_80%_12%,rgba(163,230,53,0.14),transparent_24rem)]"
          animate={{ opacity: [0.75, 1, 0.75], scale: [1, 1.025, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <Container className="relative">
          <div className="max-w-3xl">
            <Badge variant="growth">Tarifs officiels</Badge>
            <h1 className="mt-6 text-balance font-display text-4xl font-semibold leading-tight tracking-normal text-white sm:text-6xl">
              Tarifs d’expédition vers la RDC
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Consultez nos prix par kilogramme selon la destination de votre colis.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-16">
        <Container>
          <div className="grid gap-5 lg:grid-cols-3">
            {popularPricingDestinations.map((destination) => (
              <PopularPricingCard key={destination.city} destination={destination} />
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-14 sm:py-16">
        <Container>
          <GlassPanel className="p-5 sm:p-7" glow="blue">
            <div className="grid gap-5 lg:grid-cols-[0.42fr_0.58fr] lg:items-end">
              <div>
                <Badge variant="premium">Recherche destination</Badge>
                <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white">
                  Tableau des tarifs
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Filtrez rapidement une ville et comparez le prix par kilogramme.
                </p>
              </div>
              <div className="flex min-h-12 items-center gap-3 rounded-md border border-white/10 bg-ebe-night/80 px-4">
                <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-12 w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-muted-foreground"
                  placeholder="Rechercher une destination"
                  aria-label="Rechercher une destination"
                />
              </div>
            </div>

            <div className="mt-7 overflow-hidden rounded-lg border border-white/10">
              <div className="hidden sm:block">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-white/[0.06] text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-5 py-4 font-semibold">Destination</th>
                      <th className="px-5 py-4 font-semibold">Prix par kg</th>
                      <th className="px-5 py-4 font-semibold">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredDestinations.map((destination) => (
                      <PricingTableRow key={destination.city} destination={destination} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-white/10 sm:hidden">
                {filteredDestinations.map((destination) => (
                  <MobilePricingRow key={destination.city} destination={destination} />
                ))}
              </div>
            </div>

            {filteredDestinations.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed border-white/15 bg-white/[0.035] p-5 text-sm text-muted-foreground">
                Aucune destination ne correspond à votre recherche.
              </div>
            ) : null}

            <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Les tarifs peuvent varier selon les conditions douanières et opérationnelles.</p>
            </div>
          </GlassPanel>
        </Container>
      </section>

      <section className="py-14 sm:py-16">
        <Container>
          <GlassPanel className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center" glow="growth">
            <div>
              <Badge variant="growth">Prêt à expédier ?</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Confirmez votre destination avec notre équipe
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Nous vérifions le poids, le volume et les conditions opérationnelles avant chaque
                départ.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:flex">
              <Button asChild variant="growth" size="lg">
                <Link href="/contact">
                  <PackageCheck className="h-5 w-5" />
                  Demander une expédition
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

function PopularPricingCard({ destination }: { destination: PricingDestination }) {
  return (
    <GlassPanel className="p-5" glow="growth">
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-md border border-accent/25 bg-accent/15 text-accent">
          <MapPin className="h-5 w-5" />
        </div>
        <Badge variant="growth">Destination populaire</Badge>
      </div>
      <h2 className="mt-7 text-2xl font-semibold tracking-normal text-white">{destination.city}</h2>
      <p className="mt-2 text-sm text-muted-foreground">Tarif par kilogramme</p>
      <p className="mt-5 text-4xl font-semibold tracking-normal text-white">
        {destination.pricePerKg} $ <span className="text-base text-muted-foreground">/ kg</span>
      </p>
    </GlassPanel>
  );
}

function PricingTableRow({ destination }: { destination: PricingDestination }) {
  return (
    <tr className="bg-white/[0.025] transition-colors hover:bg-white/[0.055]">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md border border-primary/20 bg-primary/10 text-[#AFC7FF]">
            <BadgeDollarSign className="h-4 w-4" />
          </div>
          <span className="font-semibold text-white">{destination.city}</span>
        </div>
      </td>
      <td className="px-5 py-4 text-lg font-semibold text-white">{destination.pricePerKg} $ / kg</td>
      <td className="px-5 py-4">
        {destination.popular ? (
          <Badge variant="growth">Destination populaire</Badge>
        ) : (
          <Badge variant="muted">Disponible</Badge>
        )}
      </td>
    </tr>
  );
}

function MobilePricingRow({ destination }: { destination: PricingDestination }) {
  return (
    <div className="bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-white">{destination.city}</p>
          <p className="mt-1 text-sm text-muted-foreground">Prix par kilogramme</p>
        </div>
        {destination.popular ? (
          <Badge variant="growth">Populaire</Badge>
        ) : (
          <Badge variant="muted">Disponible</Badge>
        )}
      </div>
      <p className="mt-4 text-2xl font-semibold text-white">{destination.pricePerKg} $ / kg</p>
    </div>
  );
}
