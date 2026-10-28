"use server";

import { revalidatePath } from "next/cache";
import { normalizePayerReference } from "@/lib/manual-payment";
import { isOrderId, orderStore } from "@/lib/orders";
import { declareManualPayment } from "@/lib/payments";

export interface DeclareFormState {
  error?: string;
}

export async function declarePayment(orderId: string, _prev: DeclareFormState, formData: FormData): Promise<DeclareFormState> {
  if (!isOrderId(orderId)) return { error: "Commande introuvable." };
  const raw = formData.get("payerReference");
  const reference = normalizePayerReference(typeof raw === "string" ? raw : "");
  if (!reference) return { error: "Indiquez la référence de la transaction reçue par SMS (4 caractères minimum)." };

  try {
    await declareManualPayment(orderStore(), orderId, reference);
  } catch (error) {
    console.error("[commande] déclaration de paiement impossible", error);
    return { error: "La déclaration n'a pas pu être enregistrée. Réessayez dans quelques instants." };
  }
  revalidatePath(`/commande/${orderId}`);
  return {};
}
