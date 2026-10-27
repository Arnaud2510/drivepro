"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ChevronDown, Loader2, Lock } from "lucide-react";
import { submitCheckout, type CheckoutFormState } from "@/app/checkout/actions";
import type { CheckoutField } from "@/lib/checkout-validation";
import type { Country } from "@/lib/countries";

interface CheckoutFormProps {
  planId: string;
  countries: readonly Country[];
}

const INPUT =
  "h-12 w-full rounded-xl border bg-black px-4 text-base text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]";

function Field({
  name,
  label,
  error,
  hint,
  children,
}: {
  name: CheckoutField;
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string; className: string }) => React.ReactNode;
}) {
  const id = `checkout-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-300">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
        className: `${INPUT} ${error ? "border-red-500" : "border-white/15"}`,
      })}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-red-400">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-zinc-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-14 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#2563EB] px-4 text-[clamp(1rem,4.8vw,1.125rem)] font-bold text-white shadow-[0_8px_28px_-8px_rgba(255,107,0,0.65),0_8px_28px_-8px_rgba(37,99,235,0.65)] outline-none transition-[transform,filter] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
    >
      {pending ? (
        <>
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
          Redirection vers le paiement…
        </>
      ) : (
        <>
          <Lock aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
          Payer maintenant
        </>
      )}
    </button>
  );
}

export default function CheckoutForm({ planId, countries }: CheckoutFormProps) {
  const [state, formAction] = useFormState<CheckoutFormState, FormData>(submitCheckout, {});
  const [countryCode, setCountryCode] = useState(countries.length === 1 ? countries[0].code : "");
  const country = countries.find((c) => c.code === countryCode);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="planId" value={planId} />

      <Field name="country" label="Pays de paiement" error={errors.country}>
        {(props) => (
          <div className="relative">
            <select
              {...props}
              name="country"
              required
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className={`${props.className} appearance-none pr-11`}
            >
              <option value="" disabled>
                Choisissez un pays
              </option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
            />
          </div>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
        <Field name="firstName" label="Prénom" error={errors.firstName}>
          {(props) => <input {...props} name="firstName" autoComplete="given-name" required maxLength={100} />}
        </Field>
        <Field name="lastName" label="Nom" error={errors.lastName}>
          {(props) => <input {...props} name="lastName" autoComplete="family-name" required maxLength={100} />}
        </Field>
      </div>

      <Field name="email" label="E-mail" error={errors.email} hint="Votre reçu et votre eSIM seront envoyés à cette adresse.">
        {(props) => (
          <input {...props} name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} />
        )}
      </Field>

      <Field
        name="phone"
        label="Téléphone (facultatif)"
        error={errors.phone}
        hint={country ? `Numéro ${country.name} (${country.callingCode}), utile pour le Mobile Money.` : undefined}
      >
        {(props) => (
          <input
            {...props}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={country ? `${country.callingCode} …` : undefined}
            maxLength={20}
          />
        )}
      </Field>

      {state.message && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {state.message}
        </p>
      )}

      <div className="mt-2">
        <SubmitButton />
        <p className="mt-3 text-center text-xs text-zinc-500">
          Paiement sécurisé par CinetPay : Mobile Money (Orange, MTN, Moov, Wave) ou carte bancaire, selon votre pays.
        </p>
      </div>
    </form>
  );
}
