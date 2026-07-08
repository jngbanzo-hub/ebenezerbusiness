"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Search, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const trackingSchema = z.object({
  reference: z
    .string()
    .min(4, "Reference trop courte")
    .max(40, "Reference trop longue")
    .regex(/^[a-zA-Z0-9-]+$/, "Utilisez uniquement lettres, chiffres et tirets")
});

type TrackingFormValues = z.infer<typeof trackingSchema>;

type TrackingSearchProps = {
  className?: string;
  inputId?: string;
  placeholder?: string;
  submitLabel?: string;
};

export function TrackingSearch({
  className,
  inputId = "tracking-reference",
  placeholder = "EBE-2026-1849",
  submitLabel = "Suivre"
}: TrackingSearchProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitSuccessful }
  } = useForm<TrackingFormValues>({
    resolver: zodResolver(trackingSchema),
    defaultValues: {
      reference: ""
    }
  });

  function onSubmit(values: TrackingFormValues) {
    console.info("Tracking reference submitted", values.reference);
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn(
        "glass-surface rounded-xl p-3 sm:flex sm:items-center sm:gap-3",
        className
      )}
    >
      <label className="sr-only" htmlFor={inputId}>
        Reference de suivi
      </label>
      <div className="flex min-h-12 flex-1 items-center gap-3 rounded-md border border-white/10 bg-ebe-night/80 px-4">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          id={inputId}
          className="h-12 w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-muted-foreground"
          placeholder={placeholder}
          {...register("reference")}
        />
      </div>
      <Button type="submit" variant="growth" className="mt-3 w-full sm:mt-0 sm:w-auto">
        {submitLabel}
      </Button>
      <div className="mt-3 flex min-h-5 items-center gap-2 px-1 text-xs text-muted-foreground sm:hidden">
        <ShieldCheck className="h-4 w-4 text-accent" />
        {errors.reference?.message ?? (isSubmitSuccessful ? "Reference envoyee" : "Suivi securise")}
      </div>
    </form>
  );
}
