"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LockKeyhole, LogIn, ShieldCheck } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HomeNavbar } from "@/features/home/home-navbar";
import { SiteFooter } from "@/features/home/site-footer";
import { getAgentProfile, signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

const inputClassName =
  "mt-2 h-12 w-full rounded-md border border-white/15 bg-white/[0.05] px-4 text-white outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError || !data.session || !data.user) {
        throw new Error("Adresse e-mail ou mot de passe incorrect.");
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("La session n’a pas pu être créée.");
      }

      await getAgentProfile(data.user);
      router.replace("/agent");
      router.refresh();
    } catch (caughtError) {
      await signOutAgent().catch(() => undefined);
      setError(caughtError instanceof Error ? caughtError.message : "Connexion impossible.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-ebe-night text-white">
      <HomeNavbar />

      <section className="relative border-b border-white/10 pb-16 pt-28 sm:pb-20 sm:pt-32">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(30,99,255,0.24),transparent_30rem),radial-gradient(circle_at_82%_20%,rgba(163,230,53,0.14),transparent_24rem)]"
        />
        <Container className="relative">
          <div className="mx-auto max-w-xl text-center">
            <Badge variant="growth">Espace sécurisé</Badge>
            <div className="mx-auto mt-8 grid h-16 w-16 place-items-center rounded-xl border border-accent/25 bg-accent/15 text-accent shadow-lime">
              <LockKeyhole className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
              Connexion agent
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Identifiez-vous avec votre compte professionnel pour accéder à la caisse agent.
            </p>
          </div>

          <GlassPanel className="mx-auto mt-10 max-w-xl p-5 sm:p-7" glow="growth">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg border border-primary/25 bg-primary/15 text-[#AFC7FF]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Accès professionnel</h2>
                <p className="text-sm text-muted-foreground">Compte agent actif requis</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block text-sm font-medium text-white">
                Adresse e-mail
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="agent@exemple.com"
                  className={inputClassName}
                />
              </label>

              <label className="block text-sm font-medium text-white">
                Mot de passe
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClassName}
                />
              </label>

              {error ? (
                <p role="alert" className="rounded-md border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}

              <Button type="submit" variant="growth" size="lg" className="w-full" disabled={isSubmitting}>
                <LogIn className="h-5 w-5" />
                {isSubmitting ? "Connexion…" : "Se connecter"}
              </Button>
            </form>
          </GlassPanel>

          <div className="mt-8 text-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          </div>
        </Container>
      </section>

      <SiteFooter />
    </main>
  );
}
