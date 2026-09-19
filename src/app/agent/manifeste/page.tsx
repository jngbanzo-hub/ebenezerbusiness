import type { Metadata } from "next";
import Link from "next/link";

import { AgentManifestControl } from "@/features/agent/agent-manifest-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Manifeste — Agent COO",
  description: "Consultation en lecture seule des manifestes FIH, LSHI et KLZ.",
  path: "/agent/manifeste",
  noIndex: true
});

export default function AgentManifestPage() {
  return <main className="min-h-screen bg-ebe-night px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-7xl"><Link href="/agent" className="text-sm font-semibold text-accent hover:underline">← Retour au tableau de bord Agent</Link><AgentManifestControl cooModule /></div></main>;
}
