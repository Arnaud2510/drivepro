import Link from "next/link";
import { Wifi } from "lucide-react";
import AfricaMap from "@/components/AfricaMap";
import IconGradientDefs from "@/components/IconGradientDefs";
import PlanCard from "@/components/PlanCard";
import { PLANS } from "@/lib/plans";

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-black">
      <IconGradientDefs />

      <div className="mx-auto flex w-full max-w-md flex-col pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:pt-10">
        <section aria-label="Couverture" className="pt-2">
          <AfricaMap />
        </section>

        <h1 className="wa-fade-up mt-6 flex items-center justify-center gap-2.5 text-center text-[clamp(2.5rem,11vw,3rem)] font-extrabold leading-none tracking-tight text-white [animation-delay:150ms]">
          <Wifi aria-hidden="true" className="wa-neon-icon h-[0.8em] w-[0.8em] shrink-0" strokeWidth={2.5} />
          WifiAfrik
        </h1>

        <section aria-labelledby="forfaits-title" className="mt-10">
          <div className="wa-fade-up flex flex-col items-center [animation-delay:250ms]">
            <h2 id="forfaits-title" className="text-center text-2xl font-bold text-white sm:text-[1.75rem]">
              Nos forfaits eSIM
            </h2>
            <span aria-hidden="true" className="mt-2 h-1 w-12 rounded-full bg-[#FF6B00] shadow-[0_0_10px_rgba(255,107,0,0.7)]" />
          </div>

          <ul className="mt-6 flex flex-col gap-4">
            {PLANS.map((plan, index) => (
              <li key={plan.id}>
                <PlanCard plan={plan} index={index} />
              </li>
            ))}
          </ul>
        </section>

        <div className="wa-fade-up mt-8 [animation-delay:700ms]">
          <Link
            href="/plans"
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#2563EB] whitespace-nowrap px-4 text-center text-[clamp(1rem,4.8vw,1.125rem)] font-bold text-white shadow-[0_8px_28px_-8px_rgba(255,107,0,0.65),0_8px_28px_-8px_rgba(37,99,235,0.65)] outline-none transition-[transform,filter,box-shadow] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] active:brightness-95"
          >
            Activer mon eSIM maintenant
          </Link>
        </div>
      </div>
    </main>
  );
}
