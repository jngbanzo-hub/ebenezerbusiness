"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

type HeroStatCounterProps = {
  value: number;
  suffix?: string;
  label: string;
};

export function HeroStatCounter({ value, suffix = "+", label }: HeroStatCounterProps) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest).toLocaleString("fr-FR"));

  useEffect(() => {
    const controls = animate(count, value, {
      duration: 1.9,
      ease: [0.22, 1, 0.36, 1],
      delay: 0.35
    });

    return () => controls.stop();
  }, [count, value]);

  return (
    <div className="inline-flex min-w-[190px] items-center gap-4 rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3 shadow-glow backdrop-blur-xl">
      <div className="h-10 w-px bg-ebe-electric" aria-hidden="true" />
      <div>
        <p className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          <motion.span>{rounded}</motion.span>
          {suffix}
        </p>
        <p className="mt-1 text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
