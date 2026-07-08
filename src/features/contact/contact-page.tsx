"use client";

import { FormEvent, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Building2,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Send,
  ShieldCheck
} from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  companyAgencies,
  companyInfo,
  toTelHref,
  toWhatsAppHref,
  type CompanyAgency
} from "@/config/company";
import { HomeNavbar } from "@/features/home/home-navbar";
import { BrandLogo } from "@/features/home/brand-logo";
import { SiteFooter } from "@/features/home/site-footer";

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const cotonouAgency =
    companyAgencies.find((agency) => agency.id === "cotonou") ?? companyAgencies[0];
  const contactLogoLoop = shouldReduceMotion
    ? { opacity: 1, scale: 1, y: 0 }
    : {
        opacity: 1,
        scale: [1, 1.012, 1],
        y: [0, -4, 0]
      };
  const contactLogoHaloLoop = shouldReduceMotion
    ? { opacity: 0.42, scale: 1 }
    : {
        opacity: [0.3, 0.52, 0.3],
        scale: [0.98, 1.04, 0.98]
      };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const agencyId = String(formData.get("agency") ?? "");
    const agency = companyAgencies.find((item) => item.id === agencyId);
    const agencyLabel = agency ? `${agency.city} - ${agency.country}` : "";
    const whatsappMessage = [
      `Bonjour ${companyInfo.name},`,
      "",
      "Je souhaite demander un devis.",
      "",
      `Nom : ${String(formData.get("name") ?? "")}`,
      `Téléphone : ${String(formData.get("phone") ?? "")}`,
      `Email : ${String(formData.get("email") ?? "")}`,
      `Agence concernée : ${agencyLabel}`,
      `Destination : ${String(formData.get("destination") ?? "")}`,
      `Message : ${String(formData.get("message") ?? "")}`,
      "",
      "Merci de me recontacter."
    ].join("\n");
    const whatsappUrl = `${companyInfo.primaryWhatsappHref}?text=${encodeURIComponent(
      whatsappMessage
    )}`;

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />

      <section className="relative border-b border-white/10 pb-14 pt-28 sm:pb-16 sm:pt-32">
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(30,99,255,0.24),transparent_30rem),radial-gradient(circle_at_82%_15%,rgba(163,230,53,0.14),transparent_24rem)]"
          animate={
            shouldReduceMotion
              ? { opacity: 0.84, scale: 1 }
              : { opacity: [0.75, 1, 0.75], scale: [1, 1.025, 1] }
          }
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 9, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <Container className="relative grid gap-10 lg:grid-cols-[0.58fr_0.42fr] lg:items-end">
          <div className="text-center">
            <Badge variant="growth">Contacts officiels</Badge>
            <h1 className="sr-only">Contact officiel {companyInfo.name}</h1>
            <motion.div
              className="relative mx-auto mt-8 flex w-full max-w-[640px] justify-center rounded-2xl p-2 sm:p-3"
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.97, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
            >
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-1 z-0 rounded-[1.65rem] bg-[radial-gradient(circle_at_36%_30%,rgba(56,189,248,0.30),transparent_36%),radial-gradient(circle_at_72%_62%,rgba(163,230,53,0.24),transparent_38%)] blur-2xl"
                animate={contactLogoHaloLoop}
                transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="relative z-10 w-full rounded-2xl"
                animate={contactLogoLoop}
                transition={{ duration: 8.8, repeat: Infinity, ease: "easeInOut" }}
                style={{ willChange: shouldReduceMotion ? "auto" : "transform" }}
              >
                <motion.div
                  className="rounded-2xl"
                  animate={
                    shouldReduceMotion
                      ? {
                          boxShadow:
                            "0 0 0 1px rgba(255,255,255,0.10), 0 0 26px rgba(30,99,255,0.15)"
                        }
                      : {
                          boxShadow: [
                            "0 0 0 1px rgba(255,255,255,0.10), 0 0 26px rgba(30,99,255,0.15)",
                            "0 0 0 1px rgba(56,189,248,0.20), 0 0 46px rgba(163,230,53,0.18)",
                            "0 0 0 1px rgba(255,255,255,0.10), 0 0 26px rgba(30,99,255,0.15)"
                          ]
                        }
                  }
                  transition={{ duration: 6.6, repeat: Infinity, ease: "easeInOut" }}
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
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Retrouvez nos agences officielles, nos coordonnées vérifiées et un formulaire pour
              préparer votre demande logistique avec notre équipe.
            </p>
          </div>

          <GlassPanel className="p-5" glow="growth">
            <div className="grid gap-4">
              <ContactLine icon={Mail} label="Email" value={companyInfo.email} />
              <ContactLinks
                icon={Phone}
                label="Téléphone"
                values={companyInfo.phones}
                hrefFor={toTelHref}
              />
              <ContactLinks
                icon={MessageCircle}
                label="WhatsApp"
                values={companyInfo.whatsappNumbers}
                hrefFor={toWhatsAppHref}
              />
              <ContactLine icon={Clock3} label="Horaires" value={companyInfo.hours} />
            </div>
          </GlassPanel>
        </Container>
      </section>

      <section className="border-b border-white/10 bg-white/[0.025] py-10 sm:py-12">
        <Container>
          <GlassPanel
            className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center"
            glow="growth"
          >
            <div>
              <Badge variant="growth">Nous contacter rapidement</Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-normal text-white sm:text-3xl">
                Une équipe disponible pour vos expéditions Bénin - RDC.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Appelez le siège de Cotonou, ouvrez une conversation WhatsApp officielle ou
                consultez les agences disponibles.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:flex">
              <Button asChild variant="outline" size="lg">
                <a href={toTelHref(cotonouAgency.phones[0])}>
                  <Phone className="h-5 w-5" />
                  Appeler Cotonou
                </a>
              </Button>
              <Button asChild variant="growth" size="lg">
                <a href={companyInfo.primaryWhatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  WhatsApp principal
                </a>
              </Button>
              <Button asChild variant="premium" size="lg">
                <a href="#agences">
                  <MapPin className="h-5 w-5" />
                  Voir nos agences
                </a>
              </Button>
            </div>
          </GlassPanel>
        </Container>
      </section>

      <section id="agences" className="scroll-mt-28 py-14 sm:py-16">
        <Container>
          <div className="mb-10 max-w-3xl">
            <Badge variant="premium">Agences</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              Nos agences officielles
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Ces informations proviennent de la source centrale du projet et peuvent être
              réutilisées sur les futures pages agences.
            </p>
          </div>

          <div className="grid auto-rows-fr gap-5 md:grid-cols-2">
            {companyAgencies.map((agency) => (
              <AgencyCard key={agency.id} agency={agency} />
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-14 sm:py-16">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.45fr_0.55fr]">
            <div>
              <Badge variant="growth">Formulaire</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Envoyer une demande
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                Décrivez votre besoin : destination, poids estimé, service souhaité et délai.
              </p>
            </div>

            <GlassPanel className="p-5 sm:p-6" glow="blue">
              <form onSubmit={handleSubmit} className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Nom complet" name="name" placeholder="Votre nom" required />
                  <FormField
                    label="Téléphone"
                    name="phone"
                    placeholder="Votre téléphone"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Email" name="email" placeholder="Votre email" type="email" />
                  <FormField
                    label="Destination"
                    name="destination"
                    placeholder="Destination du colis"
                    required
                  />
                </div>
                <div className="grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-white">
                    Agence concernée
                    <select
                      name="agency"
                      className="h-12 rounded-md border border-white/10 bg-ebe-night/80 px-4 text-sm text-white outline-none"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        Choisir une agence
                      </option>
                      {companyAgencies.map((agency) => (
                        <option key={agency.id} value={agency.id}>
                          {agency.city} - {agency.country}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="grid gap-2 text-sm font-medium text-white">
                  Message
                  <textarea
                    name="message"
                    rows={5}
                    placeholder="Décrivez votre demande"
                    required
                    className="resize-none rounded-md border border-white/10 bg-ebe-night/80 px-4 py-3 text-sm text-white outline-none placeholder:text-muted-foreground"
                  />
                </label>
                <Button type="submit" variant="growth" size="lg" className="w-full sm:w-auto">
                  <Send className="h-5 w-5" />
                  Envoyer la demande
                </Button>
                {submitted ? (
                  <div className="rounded-md border border-accent/25 bg-accent/10 p-3 text-sm font-medium text-accent">
                    Demande prête. Vous pouvez aussi contacter directement l’agence concernée par
                    téléphone ou WhatsApp.
                  </div>
                ) : null}
              </form>
            </GlassPanel>
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-16">
        <Container>
          <GlassPanel className="grid gap-6 p-6 text-center sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:text-left" glow="growth">
            <div>
              <Badge variant="premium">Accompagnement professionnel</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Besoin d’une réponse rapide ?
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Contactez l’agence la plus proche ou préparez votre demande d’expédition depuis ce
                formulaire.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:flex">
              <Button asChild variant="outline" size="lg">
                <a href={toTelHref(cotonouAgency.phones[0])}>
                  <Phone className="h-5 w-5" />
                  Appeler Cotonou
                </a>
              </Button>
              <Button asChild variant="growth" size="lg">
                <a href={companyInfo.primaryWhatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  WhatsApp principal
                </a>
              </Button>
              <Button asChild variant="premium" size="lg">
                <a href="#agences">
                  <MapPin className="h-5 w-5" />
                  Voir nos agences
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

function AgencyCard({ agency }: { agency: CompanyAgency }) {
  const flag = agency.country === "Bénin" ? "🇧🇯" : "🇨🇩";

  return (
    <GlassPanel className="flex h-full min-h-[31rem] flex-col justify-between gap-6 p-5" glow="blue">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-md border border-primary/25 bg-primary/15 text-[#AFC7FF]">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {agency.isHeadOffice ? <Badge variant="growth">SIÈGE</Badge> : null}
            <Badge variant={agency.country === "Bénin" ? "growth" : "default"}>{agency.country}</Badge>
          </div>
        </div>
        <h3 className="mt-6 text-xl font-semibold tracking-normal text-white">
          {flag} {agency.city}
          {agency.isHeadOffice ? " (Siège)" : ""}
        </h3>
        <p className="mt-1 text-sm font-medium text-accent">{agency.city}</p>
        <address className="mt-4 not-italic text-sm leading-6 text-muted-foreground">
          {agency.addressLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </address>
      </div>

      <div className="grid gap-3 rounded-lg border border-white/10 bg-ebe-night/55 p-4">
        <ContactLinks icon={Phone} label="Téléphone" values={agency.phones} hrefFor={toTelHref} />
        <ContactLinks
          icon={MessageCircle}
          label="WhatsApp"
          values={agency.whatsappNumbers}
          hrefFor={toWhatsAppHref}
          external
        />
        <ContactLine icon={Mail} label="Email" value={agency.email} />
        <AgencyHours agency={agency} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild variant="outline">
          <a href={toWhatsAppHref(agency.whatsappNumbers[0])} target="_blank" rel="noreferrer">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
        </Button>
        <Button asChild variant="growth">
          <a href={toTelHref(agency.phones[0])}>
            <ShieldCheck className="h-4 w-4" />
            Appeler
          </a>
        </Button>
        {agency.directionsHref ? (
          <Button asChild variant="premium" className="sm:col-span-2">
            <a href={agency.directionsHref} target="_blank" rel="noreferrer">
              <Navigation className="h-4 w-4" />
              Itinéraire
            </a>
          </Button>
        ) : null}
      </div>
    </GlassPanel>
  );
}

function AgencyHours({ agency }: { agency: CompanyAgency }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.055] text-accent">
        <Clock3 className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Horaires</p>
        <div className="mt-2 grid gap-2">
          {agency.openingHours.map((slot) => (
            <div
              key={`${agency.id}-${slot.days}`}
              className="rounded-md border border-white/10 bg-white/[0.045] px-3 py-2"
            >
              <p className="text-xs font-semibold text-muted-foreground">{slot.days}</p>
              <p className="mt-1 inline-flex items-center gap-2 font-semibold text-white">
                <Clock3 className="h-3.5 w-3.5 text-accent" />
                {slot.time}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContactLine({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.055] text-accent">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        <p className="mt-0.5 font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

function ContactLinks({
  icon: Icon,
  label,
  values,
  hrefFor,
  external = false
}: {
  icon: typeof Mail;
  label: string;
  values: readonly string[];
  hrefFor: (value: string) => string;
  external?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.055] text-accent">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex flex-col gap-1">
          {values.map((value) => (
            <a
              key={value}
              href={hrefFor(value)}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
              className="font-semibold text-white transition-colors hover:text-accent"
            >
              {value}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  name,
  placeholder,
  type = "text",
  required = false
}: {
  label: string;
  name: string;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-white">
      {label}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="h-12 rounded-md border border-white/10 bg-ebe-night/80 px-4 text-sm text-white outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
