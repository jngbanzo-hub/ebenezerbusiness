"use client";

import {
  BadgeCheck,
  Boxes,
  Globe2,
  PackageCheck,
  Plane,
  Route,
  Ship,
  Truck
} from "lucide-react";

import {
  Container,
  DestinationCard,
  GlassPanel,
  SectionHeader,
  ServiceCard,
  StatCard,
  TrackingSearch
} from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { companyInfo } from "@/config/company";
import { designTokens } from "@/lib/design-tokens";

const services = [
  {
    title: "Fret maritime",
    description: "Consolidation, suivi documentaire et pilotage des conteneurs internationaux.",
    icon: Ship
  },
  {
    title: "Fret aerien",
    description: "Expeditions sensibles avec priorisation des delais et visibilite operationnelle.",
    icon: Plane
  },
  {
    title: "Transport terrestre",
    description: "Distribution regionale, coordination des hubs et preuve de livraison.",
    icon: Truck
  }
];

const destinations = [
  {
    city: "Lagos",
    country: "Nigeria",
    route: "Europe -> Afrique de l'Ouest",
    status: "Prioritaire" as const
  },
  {
    city: "Cotonou",
    country: "Benin",
    route: "Asie -> Golfe de Guinee",
    status: "Actif" as const
  },
  {
    city: "Abidjan",
    country: "Cote d'Ivoire",
    route: "Ameriques -> Afrique",
    status: "Bientot" as const
  }
];

export function DesignSystemDemo() {
  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night">
      <section className="relative border-b border-white/10 bg-ebe-radial py-20 sm:py-24">
        <Container>
          <div className="max-w-4xl">
            <Badge variant="growth">Design System v0.1</Badge>
            <h1 className="mt-6 text-balance font-display text-5xl font-semibold tracking-normal text-white sm:text-7xl">
              {companyInfo.name}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Identite visuelle premium pour une plateforme logistique internationale, prete a
              evoluer vers un ERP de gestion du fret.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button variant="premium" size="lg">
                <PackageCheck className="h-5 w-5" />
                Composants
              </Button>
              <Button variant="outline" size="lg">
                <Globe2 className="h-5 w-5" />
                Tokens
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <Container as="section" className="py-16 sm:py-20">
        <SectionHeader
          eyebrow="Fondations"
          title="Tokens officiels"
          description="Couleurs, rayons, ombres et gradients structurent une interface sombre, precise et lisible."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Object.entries(designTokens.colors).map(([name, value]) => (
            <div key={name} className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
              <div
                className="h-16 rounded-md border border-white/10"
                style={{ background: value }}
              />
              <p className="mt-4 text-sm font-semibold capitalize text-white">{name}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {Object.entries(designTokens.gradients).map(([name, value]) => (
            <div key={name} className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
              <div
                className="h-20 rounded-md border border-white/10"
                style={{ background: value }}
              />
              <p className="mt-4 text-sm font-semibold capitalize text-white">{name}</p>
            </div>
          ))}
        </div>
      </Container>

      <Container as="section" className="py-16 sm:py-20">
        <SectionHeader
          eyebrow="Composants"
          title="Interface core"
          description="Elements de base pour construire les futures pages marketing, portail client et modules ERP."
        />

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <GlassPanel className="p-6">
            <div className="flex flex-wrap gap-3">
              <Button>Primaire</Button>
              <Button variant="growth">Croissance</Button>
              <Button variant="outline">Contour</Button>
              <Button variant="ghost">Discret</Button>
              <Button variant="premium">Premium</Button>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Badge>Actif</Badge>
              <Badge variant="growth">Prioritaire</Badge>
              <Badge variant="muted">En attente</Badge>
              <Badge variant="premium">Premium</Badge>
            </div>
          </GlassPanel>

          <Card className="bg-white/[0.045]">
            <CardHeader>
              <CardTitle>Carte standard</CardTitle>
              <CardDescription>
                Base Shadcn-style pour les zones structurees du produit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <BadgeCheck className="h-5 w-5 text-accent" />
                Typage strict, variantes et styles reutilisables.
              </div>
            </CardContent>
          </Card>
        </div>
      </Container>

      <Container as="section" className="py-16 sm:py-20">
        <SectionHeader
          eyebrow="Patterns logistiques"
          title="Cartes metier et recherche"
          description="Premiers blocs visuels adaptes au suivi, aux services de fret et aux destinations."
        />

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <StatCard
            label="Expeditions pilotees"
            value="18.4k"
            delta="+24% ce trimestre"
            icon={Boxes}
          />
          <StatCard label="Routes actives" value="42" delta="Afrique, Europe, Asie" icon={Route} />
          <StatCard
            label="Taux de livraison"
            value="97.8%"
            delta="SLA premium"
            icon={BadgeCheck}
            tone="growth"
          />
        </div>

        <div className="mt-8">
          <TrackingSearch />
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceCard key={service.title} {...service} />
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {destinations.map((destination) => (
            <DestinationCard key={destination.city} {...destination} />
          ))}
        </div>
      </Container>
    </main>
  );
}
