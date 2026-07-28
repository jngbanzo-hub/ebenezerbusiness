import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { AgentExpenseForm } from "@/features/agent/agent-expense-form";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Dépenses Agent",
  description: "Enregistrement sécurisé des dépenses Agent.",
  path: "/agent/depenses",
  noIndex: true
});

export default function AgentExpensesPage() {
  return (
    <>
      <div className="bg-ebe-night px-4 pt-4 text-white">
        <Container>
          <Button asChild variant="outline" size="sm">
            <Link href="/agent">Retour au tableau de bord</Link>
          </Button>
        </Container>
      </div>
      <AgentExpenseForm />
    </>
  );
}
