"use client";

import { motion } from "framer-motion";
import { ArrowRight, MapPin, Plane, Ship, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function HeroLogisticsVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
      className="relative min-h-[360px] overflow-hidden rounded-xl border border-white/10 bg-ebe-panel p-4 shadow-premium backdrop-blur-xl sm:min-h-[460px] sm:p-6"
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(130deg,rgba(30,99,255,0.22),transparent_42%),linear-gradient(315deg,rgba(163,230,53,0.16),transparent_38%)]"
        animate={{ scale: [1, 1.04, 1], x: [0, -10, 0], y: [0, 8, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute inset-5 rounded-lg border border-white/10 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:36px_36px]"
        animate={{ backgroundPosition: ["0px 0px", "36px 36px", "0px 0px"] }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />

      <div className="relative flex items-center justify-between">
        <Badge variant="premium">{"Benin -> RDC"}</Badge>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-accent">
          Hub actif
        </div>
      </div>

      <div className="relative mt-10 min-h-[245px] sm:mt-16 sm:min-h-[305px]">
        <div className="absolute left-[5%] top-[10%] z-10 w-[62%] rounded-lg border border-white/10 bg-ebe-night/75 p-4 shadow-glow sm:left-[7%] sm:top-[14%] sm:w-[38%]">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <MapPin className="h-4 w-4 text-accent" />
            Cotonou, Benin
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Collecte, controle et depart expedition.
          </p>
        </div>

        <div className="absolute bottom-[6%] right-[5%] z-10 w-[64%] rounded-lg border border-white/10 bg-ebe-night/75 p-4 shadow-lime sm:bottom-[7%] sm:right-[7%] sm:w-[40%]">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <MapPin className="h-4 w-4 text-accent" />
            Kinshasa, RDC
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Reception, distribution et livraison finale.
          </p>
        </div>

        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 640 320"
          fill="none"
          role="img"
          aria-label="Ligne lumineuse reliant Cotonou à Kinshasa"
        >
          <defs>
            <linearGradient id="route-glow" x1="135" y1="95" x2="505" y2="242">
              <stop stopColor="#1E63FF" />
              <stop offset="0.55" stopColor="#38BDF8" />
              <stop offset="1" stopColor="#A3E635" />
            </linearGradient>
            <filter id="route-blur" x="-20%" y="-70%" width="140%" height="240%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <motion.path
            d="M135 98 C230 80 286 152 340 174 C404 200 438 196 505 244"
            stroke="url(#route-glow)"
            strokeWidth="7"
            strokeLinecap="round"
            filter="url(#route-blur)"
            initial={{ pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: [0, 1, 1], opacity: [0.45, 1, 0.75] }}
            transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}
          />
          <motion.circle
            r="6"
            fill="#A3E635"
            filter="url(#route-blur)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0], cx: [135, 505], cy: [98, 244] }}
            transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}
          />
        </svg>

        <div className="absolute left-[45%] top-[48%] z-10 grid h-10 w-10 place-items-center rounded-full border border-accent/30 bg-accent text-ebe-night shadow-lime sm:top-[50%]">
          <ArrowRight className="h-5 w-5" />
        </div>

        <motion.div
          animate={{ y: [0, -14, 0], x: [0, 14, 0], rotate: [-4, 6, -4] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-[15%] top-[10%] z-10 grid h-14 w-14 place-items-center rounded-lg border border-primary/25 bg-primary/15 text-[#9BB6FF] shadow-glow"
        >
          <Plane className="h-7 w-7" />
        </motion.div>

        <motion.div
          animate={{ x: [0, 10, 0], boxShadow: [
            "0 0 0 1px rgba(163,230,53,0.18), 0 12px 36px rgba(163,230,53,0.12)",
            "0 0 0 1px rgba(163,230,53,0.34), 0 20px 54px rgba(163,230,53,0.22)",
            "0 0 0 1px rgba(163,230,53,0.18), 0 12px 36px rgba(163,230,53,0.12)"
          ] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[23%] left-[28%] z-10 grid h-14 w-14 place-items-center rounded-lg border border-accent/30 bg-[linear-gradient(135deg,rgba(163,230,53,0.22),rgba(255,255,255,0.06))] text-accent"
        >
          <Truck className="h-6 w-6" />
        </motion.div>

        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[2%] left-[10%] z-10 grid h-12 w-12 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-200"
        >
          <Ship className="h-6 w-6" />
        </motion.div>
      </div>

      <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
        {["Aérien", "Routier", "Maritime"].map((mode) => (
          <div key={mode} className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{mode}</p>
            <p className="mt-1 text-sm font-semibold text-white">Trajet coordonné</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
