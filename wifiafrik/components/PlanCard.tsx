"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, CheckCircle2, Infinity as InfinityIcon, type LucideIcon } from "lucide-react";
import type { Plan, PlanAccent, PlanIcon } from "@/lib/plans";

export interface PlanSelection {
  /** Nom du groupe de boutons radio. */
  name: string;
  checked: boolean;
  onSelect: (planId: string) => void;
}

interface PlanCardProps {
  plan: Plan;
  /** Position dans la liste, utilisée pour décaler l'apparition. */
  index?: number;
  /** Si fourni, la carte devient un choix sélectionnable (bouton radio natif). */
  selection?: PlanSelection;
}

const ICONS: Record<PlanIcon, LucideIcon> = {
  calendar: CalendarDays,
  infinity: InfinityIcon,
};

const ACCENT_STYLES: Record<
  PlanAccent,
  { border: string; selected: string; badge: string; currency: string; check: string }
> = {
  orange: {
    border:
      "border-[#FF6B00]/55 shadow-[0_0_0_1px_rgba(255,107,0,0.08),0_0_24px_-6px_rgba(255,107,0,0.45)] hover:border-[#FF6B00] hover:shadow-[0_0_0_1px_rgba(255,107,0,0.25),0_0_32px_-4px_rgba(255,107,0,0.6)]",
    selected:
      "border-[#FF6B00] bg-[#FF6B00]/[0.07] shadow-[0_0_0_1px_rgba(255,107,0,0.6),0_0_36px_-4px_rgba(255,107,0,0.75)]",
    badge: "bg-[#FF6B00] shadow-[0_0_12px_rgba(255,107,0,0.55)]",
    currency: "text-[#FF6B00]",
    check: "text-[#FF6B00]",
  },
  blue: {
    border:
      "border-[#2563EB]/60 shadow-[0_0_0_1px_rgba(37,99,235,0.1),0_0_24px_-6px_rgba(37,99,235,0.5)] hover:border-[#2563EB] hover:shadow-[0_0_0_1px_rgba(37,99,235,0.3),0_0_32px_-4px_rgba(37,99,235,0.65)]",
    selected:
      "border-[#2563EB] bg-[#2563EB]/[0.08] shadow-[0_0_0_1px_rgba(37,99,235,0.65),0_0_36px_-4px_rgba(37,99,235,0.8)]",
    badge: "bg-[#2563EB] shadow-[0_0_12px_rgba(37,99,235,0.6)]",
    currency: "text-[#3B82F6]",
    check: "text-[#3B82F6]",
  },
};

export default function PlanCard({ plan, index = 0, selection }: PlanCardProps) {
  const reduceMotion = useReducedMotion();
  const Icon = ICONS[plan.icon];
  const accent = ACCENT_STYLES[plan.accent];
  const titleId = `plan-${plan.id}-title`;
  const priceId = `plan-${plan.id}-price`;
  const isSelected = selection?.checked ?? false;

  return (
    <motion.article
      aria-labelledby={titleId}
      className={`relative overflow-hidden rounded-2xl border p-4 transition-[border-color,box-shadow,background-color] duration-300 sm:p-5 ${
        isSelected ? accent.selected : `bg-black ${accent.border}`
      } ${
        selection
          ? "cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white"
          : ""
      }`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.6,
        delay: reduceMotion ? 0 : 0.35 + index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={selection && !reduceMotion ? { scale: 0.985 } : undefined}
    >
      {selection && (
        <input
          type="radio"
          name={selection.name}
          value={plan.id}
          checked={selection.checked}
          onChange={() => selection.onSelect(plan.id)}
          aria-labelledby={`${titleId} ${priceId}`}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded-2xl outline-none"
        />
      )}

      {/* Reflet subtil en haut de carte. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />

      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white ${accent.badge}`}
        >
          {plan.label}
        </span>
        {selection && (
          <CheckCircle2
            aria-hidden="true"
            className={`h-6 w-6 shrink-0 transition-opacity duration-200 ${accent.check} ${
              isSelected ? "opacity-100 drop-shadow-[0_0_6px_currentColor]" : "opacity-0"
            }`}
            strokeWidth={2}
          />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 min-[360px]:gap-3">
          <Icon aria-hidden="true" className="wa-neon-icon h-7 w-7 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0">
            <h3 id={titleId} className="text-[clamp(1.0625rem,4.6vw,1.375rem)] font-bold leading-tight text-white">
              {plan.title}
            </h3>
            {plan.detail && (
              <p className="mt-0.5 whitespace-nowrap text-[0.8125rem] text-zinc-400 min-[360px]:text-sm">
                {plan.detail}
              </p>
            )}
          </div>
        </div>

        <p
          id={priceId}
          className="shrink-0 whitespace-nowrap text-right text-[clamp(1rem,5vw,1.5rem)] font-extrabold leading-none tracking-tight text-white"
        >
          {plan.priceFcfa}
          <span className={`ml-1.5 ${accent.currency}`}>FCFA</span>
        </p>
      </div>
    </motion.article>
  );
}
