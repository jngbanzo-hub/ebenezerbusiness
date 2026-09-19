"use client";

import { MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DestinationCardProps = {
  city: string;
  country: string;
  route: string;
  status?: "Actif" | "Prioritaire" | "Bientot";
  className?: string;
};

const statusVariant = {
  Actif: "default",
  Prioritaire: "growth",
  Bientot: "muted"
} as const;

export function DestinationCard({
  city,
  country,
  route,
  status = "Actif",
  className
}: DestinationCardProps) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07]",
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-ebe-electric opacity-70" />
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-white/[0.07] text-accent">
          <MapPin className="h-5 w-5" />
        </div>
        <Badge variant={statusVariant[status]}>{status}</Badge>
      </div>
      <h3 className="mt-7 text-xl font-semibold tracking-normal text-white">{city}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{country}</p>
      <p className="mt-5 text-sm font-medium text-[#AFC7FF]">{route}</p>
    </article>
  );
}
