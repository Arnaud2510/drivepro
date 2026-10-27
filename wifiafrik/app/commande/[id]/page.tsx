import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle, type LucideIcon } from "lucide-react";
import IconGradientDefs from "@/components/IconGradientDefs";
import OrderStatusRefresher from "@/components/OrderStatusRefresher";
import PlanCard from "@/components/PlanCard";
import { clientFor } from "@/lib/cinetpay";
import { isOrderId, orderStore, type Order, type OrderStatus } from "@/lib/orders";
import { syncOrder, siteUrl } from "@/lib/payments";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Votre commande · WifiAfrik",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_UI: Record<OrderStatus, { icon: LucideIcon; title: string; text: string; tone: string }> = {
  paid: {
    icon: CheckCircle2,
    title: "Paiement confirmé",
    text: "Merci ! Votre paiement a bien été reçu.",
    tone: "text-emerald-400",
  },
  pending: {
    icon: Clock,
    title: "Paiement en cours de confirmation",
    text: "Validez le paiement sur votre téléphone si cela vous est demandé. Cette page se met à jour automatiquement.",
    tone: "text-[#FF6B00]",
  },
  failed: {
    icon: XCircle,
    title: "Paiement non abouti",
    text: "Aucun montant n'a été validé pour cette commande. Vous pouvez réessayer.",
    tone: "text-red-400",
  },
};

async function loadOrder(id: string): Promise<Order | null> {
  if (!isOrderId(id)) return null;
  const store = orderStore();
  const order = await store.getById(id);
  if (!order || order.status !== "pending") return order;
  try {
    return await syncOrder({ store, clientFor, siteUrl: siteUrl() }, order);
  } catch (error) {
    // CinetPay indisponible : on affiche le dernier statut connu, la notification prendra le relais.
    console.error("[commande] vérification CinetPay impossible", error);
    return order;
  }
}

export default async function OrderPage({ params }: { params: { id: string } }) {
  const order = await loadOrder(params.id);
  if (!order) notFound();

  const plan = PLANS.find((p) => p.id === order.planId);
  const ui = STATUS_UI[order.status];
  const Icon = ui.icon;

  return (
    <main className="min-h-dvh bg-black">
      <IconGradientDefs />

      <div className="mx-auto flex w-full max-w-md flex-col pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:pt-8">
        <header className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-md text-lg font-extrabold tracking-tight text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            WifiAfrik
          </Link>
        </header>

        <section role="status" aria-live="polite" className="wa-fade-up mt-10 flex flex-col items-center text-center">
          <Icon aria-hidden="true" className={`h-16 w-16 ${ui.tone} drop-shadow-[0_0_14px_currentColor]`} strokeWidth={1.75} />
          <h1 className="mt-5 text-[clamp(1.5rem,6.5vw,1.875rem)] font-extrabold leading-tight text-white">{ui.title}</h1>
          <p className="mt-3 max-w-sm text-zinc-400">{ui.text}</p>
          <p className="mt-4 text-xs text-zinc-500">Référence : {order.merchantTransactionId}</p>
        </section>

        {order.status === "pending" && <OrderStatusRefresher />}

        {plan && (
          <section aria-label="Forfait commandé" className="mt-8">
            <PlanCard plan={plan} />
          </section>
        )}

        <div className="mt-8">
          {order.status === "failed" ? (
            <Link
              href={`/checkout?plan=${encodeURIComponent(order.planId)}`}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#2563EB] px-4 text-lg font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98]"
            >
              Réessayer le paiement
            </Link>
          ) : (
            <Link
              href="/"
              className="flex h-14 w-full items-center justify-center rounded-2xl border border-white/15 px-4 text-base font-semibold text-white outline-none hover:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98]"
            >
              Retour à l&apos;accueil
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
