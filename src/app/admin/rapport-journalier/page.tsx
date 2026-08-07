import type { Metadata } from "next";
import { DailyReportPage } from "@/features/daily-report/daily-report-page";
import { createPageMetadata } from "@/lib/seo";
export const metadata: Metadata = createPageMetadata({ title: "Rapport synthèse du jour — Administration", description: "Synthèse opérationnelle journalière en lecture seule.", path: "/admin/rapport-journalier", noIndex: true });
export default function Page(){return <DailyReportPage role="ADMIN"/>;}
