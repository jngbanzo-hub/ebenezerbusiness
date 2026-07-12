"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Building2, MapPin, Sparkles, UserRound, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import { GlassPanel, SectionHeader } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import {
  defaultTeamSiteId,
  teamSites,
  type TeamMember,
  type TeamSite,
  type TeamSiteId
} from "@/config/teams";
import { cn } from "@/lib/utils";

const siteFlags: Record<TeamSiteId, string> = {
  cotonou: "🇧🇯",
  kinshasa: "🇨🇩",
  lubumbashi: "🇨🇩",
  kolwezi: "🇨🇩"
};

export function TeamSection() {
  const [activeSiteId, setActiveSiteId] = useState<TeamSiteId>(defaultTeamSiteId);
  const shouldReduceMotion = useReducedMotion();
  const activeSite = useMemo(
    () => teamSites.find((site) => site.id === activeSiteId) ?? teamSites[0],
    [activeSiteId]
  );

  return (
    <div className="mt-16 border-t border-white/10 pt-16 sm:mt-20 sm:pt-20">
      <SectionHeader
        eyebrow="Nos agences"
        title="Notre équipe"
        description="Découvrez les femmes et les hommes qui font avancer Eben Ezer Business dans nos différentes agences."
      />

      <div
        aria-label="Choisir une agence"
        className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        role="tablist"
      >
        {teamSites.map((site) => {
          const isActive = site.id === activeSiteId;

          return (
            <button
              key={site.id}
              aria-controls={`team-panel-${site.id}`}
              aria-selected={isActive}
              className={cn(
                "group min-h-[88px] rounded-xl border px-4 py-4 text-left transition duration-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-ebe-night",
                isActive
                  ? "border-accent/40 bg-accent/15 shadow-lime"
                  : "border-white/10 bg-white/[0.045] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-white/[0.07] hover:shadow-glow"
              )}
              id={`team-tab-${site.id}`}
              role="tab"
              type="button"
              onClick={() => setActiveSiteId(site.id)}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden="true">{siteFlags[site.id]}</span>
                {site.city}
              </span>
              <span className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-accent" />
                {site.status === "available" ? "Équipe présentée" : "Espace préparé"}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div
        key={activeSite.id}
        animate={{ opacity: 1, y: 0 }}
        aria-labelledby={`team-tab-${activeSite.id}`}
        className="mt-8"
        id={`team-panel-${activeSite.id}`}
        initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        role="tabpanel"
        transition={{ duration: 0.38, ease: "easeOut" }}
      >
        {activeSite.id === "cotonou" ? (
          <CotonouTeamContent site={activeSite} />
        ) : (
          <ComingSoonTeamContent site={activeSite} />
        )}
      </motion.div>
    </div>
  );
}

function CotonouTeamContent({ site }: { site: TeamSite }) {
  const director = site.members[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
      {director ? <DirectorCard member={director} /> : null}
      <GlassPanel className="overflow-hidden p-0" glow="blue">
        {site.image ? (
          <div className="relative aspect-[4/3] overflow-hidden">
            <Image
              alt={site.image.alt}
              className="object-cover"
              fill
              sizes="(min-width: 1024px) 58vw, 100vw"
              src={site.image.src}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(6,17,31,0.76))]"
            />
          </div>
        ) : null}
        <div className="p-5 sm:p-6">
          <Badge variant="growth" className="mb-4">
            Bloc B — Équipe de Cotonou
          </Badge>
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/15 text-accent">
              <UsersRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-normal text-white">{site.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                {site.description}
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.045] px-4 py-4">
            <p className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>{site.address}</span>
            </p>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function DirectorCard({ member }: { member: TeamMember }) {
  return (
    <GlassPanel className="overflow-hidden p-0" glow="growth">
      <div className="relative aspect-[3/4] overflow-hidden">
        <Image
          alt={member.image.alt}
          className="object-cover"
          fill
          priority={false}
          sizes="(min-width: 1024px) 38vw, 100vw"
          src={member.image.src}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,transparent_46%,rgba(6,17,31,0.82))]"
        />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <Badge variant="premium" className="mb-3">
            Bloc A — Direction générale
          </Badge>
          <h3 className="text-2xl font-semibold tracking-normal text-white">{member.name}</h3>
          <p className="mt-1 text-sm font-semibold text-accent">{member.role}</p>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/15 text-[#AFC7FF]">
            <UserRound className="h-5 w-5" />
          </div>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            {member.description}
          </p>
        </div>
      </div>
    </GlassPanel>
  );
}

function ComingSoonTeamContent({ site }: { site: TeamSite }) {
  return (
    <GlassPanel className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
      <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(30,99,255,0.28),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))]">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(6,17,31,0.22),rgba(6,17,31,0.72))]" />
        <div className="relative flex h-full min-h-[260px] flex-col items-center justify-center px-6 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-xl border border-accent/25 bg-accent/15 text-accent shadow-lime">
            <Building2 className="h-7 w-7" />
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Espace équipe
          </p>
          <p className="mt-2 text-xl font-semibold text-white">{site.city}</p>
        </div>
      </div>

      <div>
        <Badge variant="premium" className="mb-4">
          {siteFlags[site.id]} {site.city}
        </Badge>
        <h3 className="text-3xl font-semibold tracking-normal text-white">{site.title}</h3>
        <p className="mt-4 flex items-start gap-3 text-sm leading-6 text-muted-foreground sm:text-base">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{site.address}</span>
        </p>
        <div className="mt-5 rounded-lg border border-primary/20 bg-primary/10 px-4 py-4">
          <p className="flex items-start gap-3 text-sm leading-6 text-muted-foreground sm:text-base">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#AFC7FF]" />
            <span>{site.description}</span>
          </p>
        </div>
      </div>
    </GlassPanel>
  );
}
