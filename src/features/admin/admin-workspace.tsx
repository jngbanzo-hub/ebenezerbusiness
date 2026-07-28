"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminProfile, signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { AdminProfile } from "@/features/agent/types";

export function AdminWorkspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;

    async function protectRoute() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session?.user) {
          router.replace("/auth/sign-in");
          return;
        }

        const adminProfile = await getAdminProfile(session.user);
        if (active) {
          setProfile(adminProfile);
        }
      } catch (error) {
        await signOutAgent().catch(() => undefined);
        if (active) {
          setAuthError(error instanceof Error ? error.message : "Accès refusé.");
        }
      }
    }

    void protectRoute();

    const supabase = getSupabaseBrowserClient();
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setProfile(null);
        router.replace("/auth/sign-in");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    await signOutAgent();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-ebe-night px-4 text-white">
        <GlassPanel className="w-full max-w-md p-6 text-center" glow="growth">
          {authError ? (
            <>
              <h1 className="text-xl font-semibold">Accès refusé</h1>
              <p role="alert" className="mt-3 text-sm text-red-200">
                {authError}
              </p>
              <Button className="mt-6" onClick={() => router.replace("/auth/sign-in")}>
                Retour à la connexion
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">Vérification de votre accès…</p>
          )}
        </GlassPanel>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12">
      <Container>
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="growth">Administration</Badge>
            <h1 className="mt-3 text-3xl font-semibold">
              Espace Administrateur — configuration en cours
            </h1>
          </div>
          <Button type="button" variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </Button>
        </header>
      </Container>
    </main>
  );
}
