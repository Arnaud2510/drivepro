import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import IconGradientDefs from "@/components/IconGradientDefs";
import PlanSelector from "@/components/PlanSelector";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Choisir un forfait · WifiAfrik",
};

export default function PlansPage() {
  return (
    <main className="min-h-dvh bg-black">
      <IconGradientDefs />

      {/* pb : réserve la hauteur de la barre d'action fixe. */}
      <div className="mx-auto flex w-full max-w-md flex-col pb-[calc(10rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:pt-8">
        <header className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Retour à l'accueil"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white outline-none transition-colors hover:border-[#FF6B00] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95"
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <span className="text-lg font-extrabold tracking-tight text-white">WifiAfrik</span>
        </header>

        <div className="wa-fade-up mt-8 flex flex-col items-center">
          <h1 className="text-center text-[clamp(1.625rem,7vw,2rem)] font-extrabold leading-tight text-white">
            Choisissez votre forfait
          </h1>
          <span aria-hidden="true" className="mt-3 h-1 w-12 rounded-full bg-[#FF6B00] shadow-[0_0_10px_rgba(255,107,0,0.7)]" />
        </div>

        <div className="mt-8">
          <PlanSelector plans={PLANS} />
        </div>
      </div>
    </main>
  );
}
