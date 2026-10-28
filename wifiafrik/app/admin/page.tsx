import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import { ADMIN_COOKIE, adminEnabled, verifyAdminSession } from "@/lib/admin-auth";
import { findCountry } from "@/lib/countries";
import { findManualMethod } from "@/lib/manual-payment";
import { orderStore, type Order, type OrderStatus } from "@/lib/orders";
import { PLANS } from "@/lib/plans";
import { login, logout, reviewPayment } from "./actions";

export const metadata: Metadata = {
  title: "Administration · WifiAfrik",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "En attente de paiement",
  declared: "À vérifier",
  paid: "Payée",
  failed: "Refusée",
};

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "text-zinc-400 border-white/15",
  declared: "text-[#FF6B00] border-[#FF6B00]/60",
  paid: "text-emerald-400 border-emerald-500/50",
  failed: "text-red-400 border-red-500/50",
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Africa/Abidjan",
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-black">
      <div className="mx-auto w-full max-w-2xl pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:pt-8">
        {children}
      </div>
    </main>
  );
}

function LoginForm({ error }: { error: boolean }) {
  return (
    <form action={login} className="mx-auto mt-16 flex max-w-sm flex-col gap-4">
      <h1 className="text-center text-2xl font-extrabold text-white">Administration</h1>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          aria-invalid={error}
          aria-describedby={error ? "password-error" : undefined}
          className={`h-12 w-full rounded-xl border bg-black px-4 text-base text-white outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] ${
            error ? "border-red-500" : "border-white/15"
          }`}
        />
        {error && (
          <p id="password-error" className="mt-1.5 text-sm text-red-400">
            Mot de passe incorrect.
          </p>
        )}
      </div>
      <button
        type="submit"
        className="h-12 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#2563EB] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98]"
      >
        Se connecter
      </button>
    </form>
  );
}

function OrderCard({ order }: { order: Order }) {
  const plan = PLANS.find((p) => p.id === order.planId);
  const method = findManualMethod(order.paymentMethod);
  const country = findCountry(order.country);

  return (
    <li className="rounded-2xl border border-white/10 bg-black p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-white">
            {order.amount} FCFA <span className="text-sm font-medium text-zinc-400">· {plan ? `${plan.label} ${plan.title}` : order.planId}</span>
          </p>
          <p className="text-xs text-zinc-500">
            {order.merchantTransactionId} · {dateFormat.format(new Date(order.createdAt))}
          </p>
        </div>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[order.status]}`}>
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm min-[480px]:grid-cols-2">
        <div>
          <dt className="text-xs text-zinc-500">Client</dt>
          <dd className="text-white">
            {order.customerFirstName} {order.customerLastName}
            {country ? ` · ${country.name}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Contact</dt>
          <dd className="break-all text-white">
            {order.customerPhone ?? "—"}
            <br />
            {order.customerEmail}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Moyen</dt>
          <dd className="text-white">{method?.label ?? order.paymentMethod ?? order.paymentProvider}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Référence transaction (client)</dt>
          <dd className="break-all font-semibold text-white">{order.payerReference ?? "—"}</dd>
        </div>
      </dl>

      {order.paymentProvider === "manual" && (order.status === "declared" || order.status === "pending") && (
        <form action={reviewPayment} className="mt-4 grid grid-cols-2 gap-3">
          <input type="hidden" name="orderId" value={order.id} />
          <button
            type="submit"
            name="decision"
            value="paid"
            className="h-11 rounded-xl bg-emerald-600 font-semibold text-white outline-none hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98]"
          >
            Valider le paiement
          </button>
          <button
            type="submit"
            name="decision"
            value="failed"
            className="h-11 rounded-xl border border-red-500/60 font-semibold text-red-300 outline-none hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98]"
          >
            Refuser
          </button>
        </form>
      )}
    </li>
  );
}

function OrderSection({ title, orders, empty }: { title: string; orders: Order[]; empty: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
        {title} <span className="text-zinc-600">({orders.length})</span>
      </h2>
      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: { erreur?: string } }) {
  if (!adminEnabled()) {
    return (
      <Shell>
        <p className="mt-16 text-center text-zinc-400">
          L&apos;administration est désactivée : définissez ADMIN_PASSWORD (12 caractères minimum) dans les variables
          d&apos;environnement.
        </p>
      </Shell>
    );
  }

  if (!verifyAdminSession(cookies().get(ADMIN_COOKIE)?.value)) {
    return (
      <Shell>
        <LoginForm error={searchParams.erreur === "1"} />
      </Shell>
    );
  }

  let declared: Order[], pending: Order[], done: Order[];
  try {
    const store = orderStore();
    [declared, pending, done] = await Promise.all([
      store.list(["declared"], 100),
      store.list(["pending"], 50),
      store.list(["paid", "failed"], 20),
    ]);
  } catch (error) {
    // Page réservée à l'administrateur connecté : on affiche la cause (jamais de valeur secrète).
    console.error("[admin] lecture des commandes impossible", error);
    return (
      <Shell>
        <h1 className="mt-10 text-xl font-extrabold text-white">Base de données inaccessible</h1>
        <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {(error as Error).message}
        </p>
        <p className="mt-4 text-sm text-zinc-400">
          Vérifiez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans Vercel (Settings → Environment Variables) pour
          l&apos;environnement Production, puis redéployez.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-white">WifiAfrik · Commandes</h1>
        <form action={logout}>
          <button
            type="submit"
            className="flex h-10 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm text-zinc-300 outline-none hover:border-white/40 focus-visible:ring-2 focus-visible:ring-white"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Déconnexion
          </button>
        </form>
      </header>

      <p className="mt-4 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400">
        Avant de valider, vérifiez sur votre téléphone que le montant exact a bien été reçu et que la référence de
        transaction correspond, puis envoyez l&apos;eSIM au client. Dès la validation, sa page de commande affiche
        « Votre eSIM a été livrée et est activée ».
      </p>

      <OrderSection title="Paiements à vérifier" orders={declared} empty="Aucun paiement à vérifier." />
      <OrderSection title="En attente de paiement" orders={pending} empty="Aucune commande en attente." />
      <OrderSection title="Traitées récemment" orders={done} empty="Aucune commande traitée." />
    </Shell>
  );
}
