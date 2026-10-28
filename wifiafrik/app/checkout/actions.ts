"use server";

import { redirect } from "next/navigation";
import { clientFor, enabledCountries } from "@/lib/cinetpay";
import { validateCheckout, type CheckoutField } from "@/lib/checkout-validation";
import { COUNTRIES } from "@/lib/countries";
import { manualPaymentMethods, paymentMode } from "@/lib/manual-payment";
import { orderStore } from "@/lib/orders";
import { createManualOrder, startCheckout, siteUrl } from "@/lib/payments";

export interface CheckoutFormState {
  errors?: Partial<Record<CheckoutField, string>>;
  message?: string;
}

const FIELDS: readonly CheckoutField[] = ["planId", "firstName", "lastName", "email", "phone", "country", "paymentMethod"];

export async function submitCheckout(_prev: CheckoutFormState, formData: FormData): Promise<CheckoutFormState> {
  const input = Object.fromEntries(
    FIELDS.map((f) => {
      const v = formData.get(f);
      return [f, typeof v === "string" ? v : ""];
    }),
  ) as Record<CheckoutField, string>;

  const manual = paymentMode() === "manual";
  const validation = validateCheckout(
    input,
    manual
      ? { countries: COUNTRIES.map((c) => c.code), manualMethods: manualPaymentMethods().map((m) => m.id) }
      : { countries: enabledCountries() },
  );
  if (!validation.ok) return { errors: validation.errors };

  let destination: string;
  try {
    if (manual) {
      const order = await createManualOrder(orderStore(), validation.values);
      destination = `/commande/${order.id}`;
    } else {
      destination = await startCheckout({ store: orderStore(), clientFor, siteUrl: siteUrl() }, validation.values);
    }
  } catch (error) {
    console.error("[checkout] échec de la création de la commande", error);
    return { message: "La commande n'a pas pu être enregistrée. Réessayez dans quelques instants." };
  }

  // Hors du try : redirect() lève une exception interne gérée par Next.js.
  redirect(destination);
}
