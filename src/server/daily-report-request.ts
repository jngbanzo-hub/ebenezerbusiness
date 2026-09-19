import { REPORT_PERIODS, resolveReportPeriod, type ReportPeriod } from "@/features/daily-report/report-period";
import { businessDatePortoNovo } from "@/server/stockages-v2";

export function parseAdminReportPeriod(request: Request) {
  const url = new URL(request.url);
  const allowed = new Set(["period", "from", "to"]);
  if (Array.from(url.searchParams.keys()).some((key) => !allowed.has(key))) throw new Error("INVALID_REPORT_PERIOD");
  const raw = url.searchParams.get("period") || "TODAY";
  if (!REPORT_PERIODS.includes(raw as ReportPeriod)) throw new Error("INVALID_REPORT_PERIOD");
  return resolveReportPeriod({ preset: raw as ReportPeriod, today: businessDatePortoNovo(), from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
}
