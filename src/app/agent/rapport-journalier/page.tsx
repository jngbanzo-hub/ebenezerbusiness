import type { Metadata } from "next";
import { DailyReportPage } from "@/features/daily-report/daily-report-page";
import { createPageMetadata } from "@/lib/seo";
export const metadata: Metadata = createPageMetadata({ title: "Rapport synthèse du jour — Agent", description: "Synthèse journalière de l’agence en lecture seule.", path: "/agent/rapport-journalier", noIndex: true });
export default function Page(){return <DailyReportPage role="AGENT"/>;}
