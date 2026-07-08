"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

import { GlassPanel } from "@/components/design-system/glass-panel";
import { cn } from "@/lib/utils";

type ServiceCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  className?: string;
};

export function ServiceCard({ title, description, icon: Icon, className }: ServiceCardProps) {
  return (
    <GlassPanel
      className={cn(
        "group flex h-full flex-col justify-between gap-8 p-5 transition-transform duration-200 hover:-translate-y-1",
        className
      )}
    >
      <div>
        <div className="mb-5 grid h-11 w-11 place-items-center rounded-md border border-primary/25 bg-primary/15 text-[#9BB6FF]">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-xl font-semibold tracking-normal text-white">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center text-sm font-semibold text-accent">
        Explorer
        <ArrowUpRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </GlassPanel>
  );
}
