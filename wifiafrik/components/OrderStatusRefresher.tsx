"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 4000;
const MAX_ATTEMPTS = 15;

/** Recharge la page serveur tant que le paiement est en attente (environ 1 minute au maximum). */
export default function OrderStatusRefresher() {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts >= MAX_ATTEMPTS) return;
    const timer = setTimeout(() => {
      router.refresh();
      setAttempts((n) => n + 1);
    }, INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [attempts, router]);

  if (attempts < MAX_ATTEMPTS) return null;
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
