import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { AgentWorkspace } from "@/features/agent/agent-workspace";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Caisse agent",
  description: "Espace sécurisé de gestion des paiements agents.",
  path: "/agent/encaissement",
  noIndex: true
});

export default function AgentPaymentPage({
  searchParams
}: {
  searchParams?: { code?: string };
}) {
  return (
    <>
      <div className="bg-ebe-night px-4 pt-4 text-white">
        <Container>
          <Button asChild variant="outline" size="sm">
            <Link href="/agent">Retour au tableau de bord</Link>
          </Button>
        </Container>
      </div>
      <AgentWorkspace initialTrackingCode={searchParams?.code ?? ""} />
    </>
  );
}
