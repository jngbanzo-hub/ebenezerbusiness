"use client";

import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

type GlassPanelProps = HTMLMotionProps<"div"> & {
  glow?: "blue" | "growth" | "none";
};

export function GlassPanel({ className, glow = "blue", ...props }: GlassPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={cn(
        "glass-surface rounded-xl p-5",
        glow === "blue" && "shadow-glow",
        glow === "growth" && "shadow-lime",
        className
      )}
      {...props}
    />
  );
}
