"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, Infinity as InfinityIcon, type LucideIcon } from "lucide-react";

export type PlanAccent = "orange" | "blue";
export type PlanIcon = "calendar" | "infinity";

export interface Plan {
  id: string;
  /** Libellé du badge, ex. « SEMAINE ». */
  label: string;
  /** Volume ou description principale, ex. « 5Go ». */
  title: string;
  /** Ligne secondaire facultative, ex. « Valable 7 jours ». */
  detail?: string;
  /** Prix en francs CFA. */
  priceFcfa: number;
  accent: PlanAccent;
  icon: PlanIcon;
}

interface PlanCardProps {
  plan: Plan;
  /** Position dans la liste, utilisée pour décaler l'apparition. */
  index?: number;
}

const ICONS: Record<PlanIcon, LucideIcon> = {
  calendar: CalendarDays,
  infinity: InfinityIcon,
};

const ACCENT_STYLES: Record<PlanAccent, { border: string; badge: string; currency: string }> = {
  orange: {
    border:
      "border-[#FF6B00]/55 shadow-[0_0_0_1px_rgba(255,107,0,0.08),0_0_24px_-6px_rgba(255,107,0,0.45)] hover:border-[#FF6B00] hover:shadow-[0_0_0_1px_rgba(255,107,0,0.25),0_0_32px_-4px_rgba(255,107,0,0.6)]",
    badge: "bg-[#FF6B00] shadow-[0_0_12px_rgba(255,107,0,0.55)]",
    currency: "text-[#FF6B00]",
  },
  blue: {
    border:
      "border-[#2563EB]/60 shadow-[0_0_0_1px_rgba(37,99,235,0.1),0_0_24px_-6px_rgba(37,99,235,0.5)] hover:border-[#2563EB] hover:shadow-[0_0_0_1px_rgba(37,99,235,0.3),0_0_32px_-4px_rgba(37,99,235,0.65)]",
    badge: "bg-[#2563EB] shadow-[0_0_12px_rgba(37,99,235,0.6)]",
    currency: "text-[#3B82F6]",
  },
};

export default function PlanCard({ plan, index = 0 }: PlanCardProps) {
  const reduceMotion = useReducedMotion();
  const Icon = ICONS[plan.icon];
  const accent = ACCENT_STYLES[plan.accent];

  return (
    <motion.article
      aria-labelledby={`plan-${plan.id}-title`}
      className={`relative overflow-hidden rounded-2xl border bg-black p-4 transition-[border-color,box-shadow] duration-300 sm:p-5 ${accent.border}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.6,
        delay: reduceMotion ? 0 : 0.35 + index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={reduceMotion ? undefined : { y: -3 }}
    >
      {/* Reflet subtil en haut de carte. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />

      <span
        className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white ${accent.badge}`}
      >
        {plan.label}
      </span>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 min-[360px]:gap-3">
          <Icon aria-hidden="true" className="wa-neon-icon h-7 w-7 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0">
            <h3
              id={`plan-${plan.id}-title`}
              className="text-[clamp(1.0625rem,4.6vw,1.375rem)] font-bold leading-tight text-white"
            >
              {plan.title}
            </h3>
            {plan.detail && <p className="mt-0.5 whitespace-nowrap text-[0.8125rem] text-zinc-400 min-[360px]:text-sm">{plan.detail}</p>}
          </div>
        </div>

        <p className="shrink-0 whitespace-nowrap text-right text-[clamp(1rem,5vw,1.5rem)] font-extrabold leading-none tracking-tight text-white">
          {plan.priceFcfa}
          <span className={`ml-1.5 ${accent.currency}`}>FCFA</span>
        </p>
      </div>
    </motion.article>
  );
}
