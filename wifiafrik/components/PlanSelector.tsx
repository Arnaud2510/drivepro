"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PlanCard from "./PlanCard";
import type { Plan } from "@/lib/plans";

interface PlanSelectorProps {
  plans: readonly Plan[];
}

const CTA_BASE =
  "flex h-14 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 text-[clamp(1rem,4.8vw,1.125rem)] font-bold outline-none";

export default function PlanSelector({ plans }: PlanSelectorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      <fieldset>
        <legend className="sr-only">Forfaits eSIM disponibles</legend>
        <ul className="flex flex-col gap-4">
          {plans.map((plan, index) => (
            <li key={plan.id}>
              <PlanCard
                plan={plan}
                index={index}
                selection={{ name: "plan", checked: plan.id === selectedId, onSelect: setSelectedId }}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      {/* Barre d'action fixe en bas, au-dessus de la zone de sécurité. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/90 backdrop-blur-md">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-[#FF6B00]/0 via-[#FF6B00]/60 to-[#2563EB]/0"
        />
        <div className="mx-auto w-full max-w-md pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-3">
          <p aria-live="polite" className="mb-3 flex min-h-5 items-center justify-between gap-3 text-sm">
            {selected ? (
              <>
                <span className="truncate text-zinc-400">
                  Forfait choisi : <span className="font-semibold text-white">{selected.label} · {selected.title}</span>
                </span>
                <span className="shrink-0 font-bold text-white">{selected.priceFcfa} FCFA</span>
              </>
            ) : (
              <span className="text-zinc-400">Sélectionnez un forfait pour continuer</span>
            )}
          </p>

          {selected ? (
            <Link
              href={`/checkout?plan=${encodeURIComponent(selected.id)}`}
              className={`${CTA_BASE} bg-gradient-to-r from-[#FF6B00] to-[#2563EB] text-white shadow-[0_8px_28px_-8px_rgba(255,107,0,0.65),0_8px_28px_-8px_rgba(37,99,235,0.65)] transition-[transform,filter] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] active:brightness-95`}
            >
              Continuer
              <ArrowRight aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
            </Link>
          ) : (
            <button type="button" disabled className={`${CTA_BASE} cursor-not-allowed bg-zinc-900 text-zinc-500`}>
              Continuer
              <ArrowRight aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
