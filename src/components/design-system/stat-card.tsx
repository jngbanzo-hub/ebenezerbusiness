"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp } from "lucide-react";

import { GlassPanel } from "@/components/design-system/glass-panel";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  delta?: string;
  icon?: LucideIcon;
  tone?: "blue" | "growth";
  className?: string;
};

export function StatCard({
  label,
  value,
  delta,
  icon: Icon = TrendingUp,
  tone = "blue",
  className
}: StatCardProps) {
  return (
    <GlassPanel glow={tone} className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-normal text-white">{value}</p>
        </div>
        <div
          className={cn(
            "grid h-10 w-10 place-items-center rounded-md border",
            tone === "growth"
              ? "border-accent/25 bg-accent/15 text-accent"
              : "border-primary/25 bg-primary/15 text-[#88A9FF]"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {delta ? <p className="mt-4 text-sm font-medium text-accent">{delta}</p> : null}
    </GlassPanel>
  );
}
