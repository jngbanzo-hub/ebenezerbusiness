"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  CalendarClock,
  Clock3,
  MessageCircle,
  Play,
  Radio,
  Tv
} from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { companyInfo } from "@/config/company";
import { HomeNavbar } from "@/features/home/home-navbar";
import { SiteFooter } from "@/features/home/site-footer";
import { TikTokIcon, YouTubeIcon } from "@/features/home/social-links";
import { getYouTubeEmbedUrl, liveMediaConfig, type LiveScheduleItem } from "@/features/live/live-config";

const youtubeEmbedUrl = getYouTubeEmbedUrl(liveMediaConfig.youtube.liveUrl);
const hasLive = Boolean(youtubeEmbedUrl);

export function LivePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />

      <section className="relative border-b border-white/10 pb-14 pt-28 sm:pb-16 sm:pt-32">
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(30,99,255,0.26),transparent_30rem),radial-gradient(circle_at_82%_16%,rgba(163,230,53,0.14),transparent_24rem)]"
          animate={{ opacity: [0.75, 1, 0.75], scale: [1, 1.025, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <Container className="relative">
          <div className="max-w-3xl">
            <Badge variant="growth">Live & médias officiels</Badge>
            <h1 className="mt-6 text-balance font-display text-4xl font-semibold leading-tight tracking-normal text-white sm:text-6xl">
              Suivez nos directs en temps réel
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Retrouvez tous les directs, annonces et communications officielles de Eben Ezer
              Business.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-16">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.68fr_0.32fr] lg:items-start">
            <LiveVideoPlayer />
            <GlassPanel className="p-5" glow="growth">
              <div className="grid h-12 w-12 place-items-center rounded-md border border-accent/25 bg-accent/15 text-accent">
                <Radio className="h-6 w-6" />
              </div>
              <h2 className="mt-6 text-2xl font-semibold tracking-normal text-white">
                Chaîne officielle
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {liveMediaConfig.youtube.channelName}
              </p>
              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.045] p-4">
                {hasLive ? (
                  <p className="text-sm font-semibold text-accent">Direct configuré</p>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Aucun direct n&apos;est en cours actuellement.
                    <br />
                    Abonnez-vous à nos réseaux sociaux afin d&apos;être informé de notre prochain
                    direct.
                  </p>
                )}
              </div>
            </GlassPanel>
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-14 sm:py-16">
        <Container>
          <div className="mb-10 max-w-3xl">
            <Badge variant="premium">Réseaux sociaux</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              Suivez-nous sur nos réseaux officiels
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <SocialCard
              icon={YouTubeIcon}
              platform="YouTube"
              title="Suivez-nous en direct sur YouTube"
              name={liveMediaConfig.youtube.channelName}
              href={liveMediaConfig.youtube.channelUrl}
            />
            <SocialCard
              icon={TikTokIcon}
              platform="TikTok"
              title="Suivez-nous en direct sur TikTok"
              name={liveMediaConfig.tiktok.channelName}
              href={liveMediaConfig.tiktok.profileUrl}
            />
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-16">
        <Container>
          <div className="mb-10 max-w-3xl">
            <Badge variant="growth">Programme</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              Prochains directs
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {liveMediaConfig.upcomingStreams.map((item) => (
              <ScheduleCard key={`${item.date}-${item.title}`} item={item} />
            ))}
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-16">
        <Container>
          <GlassPanel className="grid gap-6 p-6 text-center sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:text-left" glow="growth">
            <div>
              <Badge variant="premium">Restez informé</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Ne manquez aucune annonce officielle
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Les liens officiels YouTube et TikTok sont prêts à être activés dès leur
                confirmation.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:flex">
              <MediaButton
                label="Suivez-nous en direct sur YouTube"
                href={liveMediaConfig.youtube.channelUrl}
              />
              <MediaButton
                label="Suivez-nous en direct sur TikTok"
                href={liveMediaConfig.tiktok.profileUrl}
              />
              <Button asChild variant="outline" size="lg">
                <a href={companyInfo.primaryWhatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  Nous contacter sur WhatsApp
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

function LiveVideoPlayer() {
  return (
    <GlassPanel className="overflow-hidden p-0" glow="blue">
      <div className="relative aspect-video w-full bg-[#020711]">
        {hasLive ? (
          <iframe
            title={`Direct YouTube - ${liveMediaConfig.youtube.channelName}`}
            src={youtubeEmbedUrl}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-primary/25 bg-primary/15 text-[#AFC7FF] shadow-glow">
                <Tv className="h-8 w-8" />
              </div>
              <h2 className="mt-6 text-2xl font-semibold tracking-normal text-white">
                Aucun direct n&apos;est en cours actuellement.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Abonnez-vous à nos réseaux sociaux afin d&apos;être informé de notre prochain
                direct.
              </p>
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

function SocialCard({
  icon: Icon,
  platform,
  title,
  name,
  href
}: {
  icon: ComponentType<{ className?: string }>;
  platform: string;
  title: string;
  name: string;
  href: string;
}) {
  return (
    <GlassPanel className="p-5" glow="none">
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-md border border-primary/25 bg-primary/15 text-[#AFC7FF]">
          <Icon className="h-6 w-6" />
        </div>
        <Badge variant={href ? "growth" : "muted"}>{href ? "Lien officiel" : "Lien à ajouter"}</Badge>
      </div>
      <h3 className="mt-6 text-xl font-semibold tracking-normal text-white">{title}</h3>
      <p className="mt-1 text-xs font-semibold uppercase text-accent">{platform}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{name}</p>
      <div className="mt-6">
        <MediaButton label={title} href={href} />
      </div>
    </GlassPanel>
  );
}

function ScheduleCard({ item }: { item: LiveScheduleItem }) {
  return (
    <GlassPanel className="p-5" glow="blue">
      <div className="flex flex-wrap gap-2">
        <Badge variant="premium">
          <CalendarClock className="mr-1 h-3.5 w-3.5" />
          {item.date}
        </Badge>
        <Badge variant="muted">
          <Clock3 className="mr-1 h-3.5 w-3.5" />
          {item.time}
        </Badge>
      </div>
      <h3 className="mt-6 text-xl font-semibold tracking-normal text-white">{item.title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
    </GlassPanel>
  );
}

function MediaButton({ label, href }: { label: string; href: string }) {
  if (!href) {
    return (
      <Button type="button" variant="outline" size="lg" disabled className="w-full">
        <Bell className="h-5 w-5" />
        {label}
      </Button>
    );
  }

  return (
    <Button asChild variant="growth" size="lg" className="w-full">
      <Link href={href} target="_blank" rel="noreferrer">
        <Play className="h-5 w-5" />
        {label}
      </Link>
    </Button>
  );
}
