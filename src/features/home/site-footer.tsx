import Link from "next/link";
import type { ComponentType } from "react";
import type { ReactNode } from "react";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { Container } from "@/components/design-system";
import {
  companyAgencies,
  companyInfo,
  primaryAgencies,
  toTelHref
} from "@/config/company";
import { BrandLogo } from "@/features/home/brand-logo";
import { footerLinks } from "@/features/home/home-data";
import { getSocialHref, officialSocialLinks } from "@/features/home/social-links";

export function SiteFooter() {
  return (
    <footer id="contact" className="border-t border-white/10 bg-[#030A13] py-12">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <BrandLogo
              surface="dark"
              className="p-1.5 transition-transform duration-300 ease-out hover:scale-[1.03]"
              imageClassName="h-14 w-auto"
            />
            <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">
              {companyInfo.name} accompagne vos expeditions entre le Bénin et la RDC avec un
              service professionnel, lisible et securise.
            </p>
            <div className="mt-5 flex gap-2">
              {officialSocialLinks.map((link) => (
                <FooterSocialLink key={link.label} {...link} />
              ))}
            </div>
          </div>

          <FooterColumn title="Liens utiles">
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </FooterColumn>

          <FooterColumn title="Agences">
            {primaryAgencies.map((agency) => (
              <span key={agency.id}>
                {agency.city}, {agency.country}
              </span>
            ))}
            <Link href="/contact">{companyAgencies.length} agences officielles</Link>
          </FooterColumn>

          <FooterColumn title="Contact">
            <span className="inline-flex items-center gap-2">
              <Mail className="h-4 w-4 text-accent" />
              {companyInfo.email}
            </span>
            <a
              href={companyInfo.primaryWhatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2"
            >
              <MessageCircle className="h-4 w-4 text-accent" />
              WhatsApp : {companyInfo.primaryWhatsappNumber}
            </a>
            <a href={toTelHref(companyInfo.phones[0])} className="inline-flex items-center gap-2">
              <Phone className="h-4 w-4 text-accent" />
              Appel : {companyInfo.phones[0]}
            </a>
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-accent" />
              Bénin - RDC
            </span>
          </FooterColumn>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 {companyInfo.name}. Tous droits réservés.</span>
          <span>Logistique internationale premium.</span>
        </div>
      </Container>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase text-white">{title}</h3>
      <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground [&_a]:transition-colors [&_a:hover]:text-white">
        {children}
      </div>
    </div>
  );
}

function FooterSocialLink({
  label,
  name,
  href,
  icon: Icon
}: {
  label: string;
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const className =
    "grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-white/[0.05] text-muted-foreground transition-colors hover:text-white";

  if (!href) {
    return (
      <span
        aria-disabled="true"
        aria-label={`${label} - ${name}`}
        title={`${label} officiel à compléter`}
        className={className}
      >
        <Icon className="h-5 w-5" />
      </span>
    );
  }

  return (
    <Link
      href={getSocialHref(href)}
      aria-label={`${label} - ${name}`}
      target="_blank"
      rel="noreferrer"
      title={name}
      className={className}
    >
      <Icon className="h-5 w-5" />
    </Link>
  );
}
