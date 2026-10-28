import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Smartphone, Wifi, XCircle, type LucideIcon } from "lucide-react";
import CopyButton from "@/components/CopyButton";
import DeclarePaymentForm from "@/components/DeclarePaymentForm";
import IconGradientDefs from "@/components/IconGradientDefs";
import OrderStatusRefresher from "@/components/OrderStatusRefresher";
import PlanCard from "@/components/PlanCard";
import { clientFor } from "@/lib/cinetpay";
import { findManualMethod, manualPaymentHolder } from "@/lib/manual-payment";
import { isOrderId, orderStore, type Order } from "@/lib/orders";
import { syncOrder, siteUrl } from "@/lib/payments";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Votre commande · WifiAfrik",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ViewKey = "paid" | "manual_paid" | "failed" | "online_pending" | "manual_pending" | "manual_declared";

const VIEWS: Record<ViewKey, { icon: LucideIcon; title: string; text: string; tone: string }> = {
  paid: {
    icon: CheckCircle2,
    title: "Paiement confirmé",
    text: "Merci ! Votre paiement a bien été reçu.",
    tone: "text-emerald-400",
  },
  manual_paid: {
    icon: CheckCircle2,
    title: "Paiement confirmé",
    text: "Merci ! Votre paiement a bien été reçu.",
    tone: "text-emerald-400",
  },
  online_pending: {
    icon: Clock,
    title: "Paiement en cours de confirmation",
    text: "Validez le paiement sur votre téléphone si cela vous est demandé. Cette page se met à jour automatiquement.",
    tone: "text-[#FF6B00]",
  },
  manual_pending: {
    icon: Smartphone,
    title: "Finalisez votre paiement",
    text: "Envoyez le montant par Mobile Money, puis indiquez la référence de la transaction ci-dessous.",
    tone: "text-[#FF6B00]",
  },
  manual_declared: {
    icon: Clock,
    title: "Paiement en cours de vérification",
    text: "Merci ! Nous vérifions la réception de votre paiement. Cette page se met à jour automatiquement dès la confirmation.",
    tone: "text-[#3B82F6]",
  },
  failed: {
    icon: XCircle,
    title: "Paiement non abouti",
    text: "Le paiement de cette commande n'a pas pu être confirmé. Vous pouvez passer une nouvelle commande.",
    tone: "text-red-400",
  },
};

function viewFor(order: Order): ViewKey {
  if (order.status === "paid") return order.paymentProvider === "manual" ? "manual_paid" : "paid";
  if (order.status === "failed") return "failed";
  if (order.paymentProvider === "cinetpay") return "online_pending";
  return order.status === "declared" ? "manual_declared" : "manual_pending";
}

async function loadOrder(id: string): Promise<Order | null> {
  if (!isOrderId(id)) return null;
  const store = orderStore();
  const order = await store.getById(id);
  if (!order || order.status !== "pending" || order.paymentProvider !== "cinetpay") return order;
  try {
    return await syncOrder({ store, clientFor, siteUrl: siteUrl() }, order);
  } catch (error) {
    // CinetPay indisponible : on affiche le dernier statut connu, la notification prendra le relais.
    console.error("[commande] vérification CinetPay impossible", error);
    return order;
  }
}

function InfoRow({ label, value, copyLabel }: { label: string; value: string; copyLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="mt-0.5 break-all text-base font-bold text-white">{value}</dd>
      </div>
      {copyLabel && <CopyButton value={value} label={copyLabel} />}
    </div>
  );
}

export default async function OrderPage({ params }: { params: { id: string } }) {
  const order = await loadOrder(params.id);
  if (!order) notFound();

  const plan = PLANS.find((p) => p.id === order.planId);
  const view = viewFor(order);
  const ui = VIEWS[view];
  const Icon = ui.icon;
  const method = view === "manual_pending" ? findManualMethod(order.paymentMethod) : undefined;
  const holder = manualPaymentHolder();

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

        {/* key : l'animation d'apparition se rejoue quand le statut change. */}
        <section key={view} role="status" aria-live="polite" className="wa-fade-up mt-10 flex flex-col items-center text-center">
          <Icon aria-hidden="true" className={`h-16 w-16 ${ui.tone} drop-shadow-[0_0_14px_currentColor]`} strokeWidth={1.75} />
          <h1 className="mt-5 text-[clamp(1.5rem,6.5vw,1.875rem)] font-extrabold leading-tight text-white">{ui.title}</h1>
          <p className="mt-3 max-w-sm text-zinc-400">{ui.text}</p>
          {view !== "manual_pending" && (
            <p className="mt-4 text-xs text-zinc-500">Référence : {order.merchantTransactionId}</p>
          )}
        </section>

        {view === "online_pending" && <OrderStatusRefresher />}
        {/* Validation par l'administrateur : vérification toutes les 5 s pendant 10 minutes. */}
        {view === "manual_declared" && <OrderStatusRefresher intervalMs={5000} maxAttempts={120} />}

        {view === "manual_paid" && (
          <section
            aria-label="Votre eSIM"
            className="wa-fade-up mt-8 flex items-center gap-4 rounded-2xl border border-emerald-500/60 bg-emerald-500/[0.07] p-4 shadow-[0_0_28px_-6px_rgba(16,185,129,0.55)] [animation-delay:150ms] sm:p-5"
          >
            <Wifi aria-hidden="true" className="h-9 w-9 shrink-0 text-emerald-400 drop-shadow-[0_0_10px_currentColor]" strokeWidth={2.25} />
            <div>
              <p className="text-lg font-extrabold leading-tight text-white">Votre eSIM a été livrée et est activée</p>
              <p className="mt-1 text-sm text-zinc-300">Vous pouvez l&apos;utiliser dès maintenant.</p>
            </div>
          </section>
        )}

        {view === "manual_pending" && (
          <section aria-labelledby="pay-title" className="mt-8">
            <div className="rounded-2xl border border-[#FF6B00]/55 bg-black p-4 shadow-[0_0_24px_-6px_rgba(255,107,0,0.45)] sm:p-5">
              <h2 id="pay-title" className="text-sm font-bold uppercase tracking-wide text-[#FF6B00]">
                1. Envoyez le paiement
              </h2>
              {method ? (
                <dl className="mt-1 divide-y divide-white/10">
                  <InfoRow label="Moyen de paiement" value={method.label} />
                  <InfoRow label="Numéro destinataire" value={method.number} copyLabel="le numéro" />
                  {holder && <InfoRow label="Au nom de" value={holder} />}
                  <InfoRow label="Montant exact" value={`${order.amount} FCFA`} copyLabel="le montant" />
                  <InfoRow label="Référence de commande (en motif si possible)" value={order.merchantTransactionId} copyLabel="la référence" />
                </dl>
              ) : (
                <p className="mt-3 text-sm text-zinc-400">
                  Ce moyen de paiement n&apos;est plus disponible. Passez une nouvelle commande.
                </p>
              )}
            </div>

            {method && (
              <div className="mt-6">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#3B82F6]">2. Confirmez votre paiement</h2>
                <DeclarePaymentForm orderId={order.id} />
              </div>
            )}

            <p className="mt-4 text-center text-xs text-zinc-500">
              Gardez le lien de cette page : il vous permet de suivre votre commande.
            </p>
          </section>
        )}

        {view === "manual_declared" && order.payerReference && (
          <p className="mt-4 text-center text-sm text-zinc-400">
            Référence de transaction indiquée : <span className="font-semibold text-white">{order.payerReference}</span>
          </p>
        )}

        {plan && (
          <section aria-label="Forfait commandé" className="mt-8">
            <PlanCard plan={plan} />
          </section>
        )}

        <div className="mt-8">
          {view === "failed" ? (
            <Link
              href={`/checkout?plan=${encodeURIComponent(order.planId)}`}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#2563EB] px-4 text-lg font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98]"
            >
              Passer une nouvelle commande
            </Link>
          ) : (
            view !== "manual_pending" && (
              <Link
                href="/"
                className="flex h-14 w-full items-center justify-center rounded-2xl border border-white/15 px-4 text-base font-semibold text-white outline-none hover:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98]"
              >
                Retour à l&apos;accueil
              </Link>
            )
          )}
        </div>
      </div>
    </main>
  );
}
