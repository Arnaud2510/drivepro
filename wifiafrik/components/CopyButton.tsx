"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copie une valeur (numéro, montant, référence) dans le presse-papiers. */
export default function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible (navigateur ancien ou refus) : la valeur reste lisible à l'écran.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copié` : `Copier ${label}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-zinc-300 outline-none transition-colors hover:border-[#FF6B00] hover:text-white focus-visible:ring-2 focus-visible:ring-white active:scale-95"
    >
      {copied ? <Check aria-hidden="true" className="h-4 w-4 text-emerald-400" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
}
