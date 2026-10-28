"use server";

import { redirect } from "next/navigation";
import { clientFor, enabledCountries } from "@/lib/cinetpay";
import { validateCheckout, type CheckoutField } from "@/lib/checkout-validation";
import { orderStore } from "@/lib/orders";
import { startCheckout, siteUrl } from "@/lib/payments";

export interface CheckoutFormState {
  errors?: Partial<Record<CheckoutField, string>>;
  message?: string;
}

const FIELDS: readonly CheckoutField[] = ["planId", "firstName", "lastName", "email", "phone", "country"];

export async function submitCheckout(_prev: CheckoutFormState, formData: FormData): Promise<CheckoutFormState> {
  const input = Object.fromEntries(
    FIELDS.map((f) => {
      const v = formData.get(f);
      return [f, typeof v === "string" ? v : ""];
    }),
  ) as Record<CheckoutField, string>;

  const validation = validateCheckout(input, enabledCountries());
  if (!validation.ok) return { errors: validation.errors };

  let paymentUrl: string;
  try {
    paymentUrl = await startCheckout({ store: orderStore(), clientFor, siteUrl: siteUrl() }, validation.values);
  } catch (error) {
    console.error("[checkout] échec de l'initialisation du paiement", error);
    return { message: "Le paiement n'a pas pu être lancé. Réessayez dans quelques instants." };
  }

  // Hors du try : redirect() lève une exception interne gérée par Next.js.
  redirect(paymentUrl);
}
