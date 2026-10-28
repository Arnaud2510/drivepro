"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface OrderStatusRefresherProps {
  /** Délai entre deux vérifications. */
  intervalMs?: number;
  /** Nombre de vérifications avant de proposer une vérification manuelle. */
  maxAttempts?: number;
}

/** Recharge la page serveur tant que le paiement n'a pas de statut final. */
export default function OrderStatusRefresher({ intervalMs = 4000, maxAttempts = 15 }: OrderStatusRefresherProps) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts >= maxAttempts) return;
    const timer = setTimeout(() => {
      router.refresh();
      setAttempts((n) => n + 1);
    }, intervalMs);
    return () => clearTimeout(timer);
  }, [attempts, intervalMs, maxAttempts, router]);

  if (attempts < maxAttempts) return null;
  return (
    <p className="mt-4 text-center text-sm text-zinc-400">
      La confirmation prend plus de temps que prévu.{" "}
      <button
        type="button"
        onClick={() => setAttempts(0)}
        className="font-semibold text-white underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Vérifier à nouveau
      </button>
    </p>
  );
}
