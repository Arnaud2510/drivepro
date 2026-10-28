import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import CheckoutForm from "@/components/CheckoutForm";
import IconGradientDefs from "@/components/IconGradientDefs";
import PlanCard from "@/components/PlanCard";
import { enabledCountries } from "@/lib/cinetpay";
import { COUNTRIES } from "@/lib/countries";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Paiement · WifiAfrik",
};

// Les pays disponibles dépendent des variables d'environnement du serveur.
export const dynamic = "force-dynamic";

export default function CheckoutPage({ searchParams }: { searchParams: { plan?: string | string[] } }) {
  const planId = typeof searchParams.plan === "string" ? searchParams.plan : "";
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) notFound();

  const enabled = new Set(enabledCountries());
  const countries = COUNTRIES.filter((c) => enabled.has(c.code));

  return (
    <main className="min-h-dvh bg-black">
      <IconGradientDefs />

      <div className="mx-auto flex w-full max-w-md flex-col pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:pt-8">
        <header className="flex items-center gap-3">
          <Link
            href="/plans"
            aria-label="Retour au choix du forfait"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white outline-none transition-colors hover:border-[#FF6B00] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95"
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <span className="text-lg font-extrabold tracking-tight text-white">WifiAfrik</span>
        </header>

        <div className="wa-fade-up mt-8 flex flex-col items-center">
          <h1 className="text-center text-[clamp(1.625rem,7vw,2rem)] font-extrabold leading-tight text-white">Paiement</h1>
          <span aria-hidden="true" className="mt-3 h-1 w-12 rounded-full bg-[#FF6B00] shadow-[0_0_10px_rgba(255,107,0,0.7)]" />
        </div>

        <section aria-label="Forfait choisi" className="mt-8">
          <PlanCard plan={plan} />
        </section>

        <section aria-label="Vos informations" className="mt-8">
          {countries.length > 0 ? (
            <CheckoutForm planId={plan.id} countries={countries} />
          ) : (
            <p role="status" className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm text-zinc-400">
              Le paiement en ligne n&apos;est pas encore disponible. Revenez bientôt.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
