"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { declarePayment, type DeclareFormState } from "@/app/commande/[id]/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-14 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#2563EB] px-4 text-[clamp(1rem,4.8vw,1.125rem)] font-bold text-white shadow-[0_8px_28px_-8px_rgba(255,107,0,0.65),0_8px_28px_-8px_rgba(37,99,235,0.65)] outline-none transition-[transform,filter] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
    >
      {pending ? (
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
      ) : (
        <CheckCircle2 aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
      )}
      J&apos;ai payé
    </button>
  );
}

export default function DeclarePaymentForm({ orderId }: { orderId: string }) {
  const [state, formAction] = useFormState<DeclareFormState, FormData>(declarePayment.bind(null, orderId), {});

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor="payerReference" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Référence de la transaction
        </label>
        <input
          id="payerReference"
          name="payerReference"
          required
          minLength={4}
          maxLength={100}
          autoComplete="off"
          placeholder="Ex. : MP241028.1530.A12345"
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "payerReference-error" : "payerReference-hint"}
          className={`h-12 w-full rounded-xl border bg-black px-4 text-base text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] ${
            state.error ? "border-red-500" : "border-white/15"
          }`}
        />
        {state.error ? (
          <p id="payerReference-error" className="mt-1.5 text-sm text-red-400">
            {state.error}
          </p>
        ) : (
          <p id="payerReference-hint" className="mt-1.5 text-xs text-zinc-500">
            Elle figure dans le SMS de confirmation envoyé par votre opérateur.
          </p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}
