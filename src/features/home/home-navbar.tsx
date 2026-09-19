"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { companyInfo } from "@/config/company";
import { BrandLogo } from "@/features/home/brand-logo";
import { navItems } from "@/features/home/home-data";
import { getSocialHref, officialSocialLinks } from "@/features/home/social-links";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HomeNavbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ebe-night/82 backdrop-blur-xl">
      <nav className="mx-auto flex h-20 w-full max-w-[1180px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/#accueil"
          aria-label={`${companyInfo.name} - Accueil`}
          className="shrink-0 transition-transform duration-300 ease-out hover:scale-[1.035] focus-visible:scale-[1.035]"
        >
          <BrandLogo
            priority
            surface="dark"
            className="p-1.5"
            imageClassName="h-10 w-auto sm:h-12"
          />
        </Link>

        <div className="hidden items-center gap-6 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <div className="mr-1 flex items-center gap-2">
            {officialSocialLinks.map((link) => (
              <HeaderSocialLink key={link.label} {...link} />
            ))}
          </div>
          <Button asChild variant="growth" size="sm">
            <Link href="/contact">Demander un devis</Link>
          </Button>
          <Button asChild variant="default" size="sm">
            <Link href="/auth/sign-in">Connexion</Link>
          </Button>
        </div>

        <button
          type="button"
          aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
          className="grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-white/[0.05] text-white lg:hidden"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      <div
        className={cn(
          "grid border-t border-white/10 bg-ebe-night/96 transition-all duration-200 lg:hidden",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-1 px-4 py-5 sm:px-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className="rounded-md px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button asChild variant="growth">
                <Link href="/contact" onClick={() => setIsOpen(false)}>
                  Demander un devis
                </Link>
              </Button>
              <Button asChild variant="default">
                <Link href="/auth/sign-in" onClick={() => setIsOpen(false)}>
                  Connexion
                </Link>
              </Button>
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4">
              {officialSocialLinks.map((link) => (
                <HeaderSocialLink key={link.label} {...link} onClick={() => setIsOpen(false)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function HeaderSocialLink({
  label,
  name,
  href,
  icon: Icon,
  onClick
}: {
  label: string;
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  const className =
    "grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/[0.05] text-muted-foreground transition-colors hover:text-white";

  if (!href) {
    return (
      <span
        aria-disabled="true"
        aria-label={`${label} - ${name}`}
        title={`${label} officiel à compléter`}
        className={className}
      >
        <Icon className="h-4 w-4" />
      </span>
    );
  }

  return (
    <Link
      href={getSocialHref(href)}
      aria-label={`${label} - ${name}`}
      onClick={onClick}
      target="_blank"
      rel="noreferrer"
      title={name}
      className={className}
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}
