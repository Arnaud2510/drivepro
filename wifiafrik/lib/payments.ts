import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { orderStatusFromCinetPay, type CinetPayClient } from "./cinetpay";
import type { CheckoutValues } from "./checkout-validation";
import type { CountryCode } from "./countries";
import type { Order, OrderStore } from "./orders";

export interface PaymentDeps {
  store: OrderStore;
  clientFor: (country: CountryCode) => Pick<CinetPayClient, "createPayment" | "findPayment"> | null;
  /** URL publique du site, sans « / » final (ex. https://wifiafrik.com). */
  siteUrl: string;
}

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

/** Identifiant marchand (30 caractères max. chez CinetPay) : « WA- » + 20 caractères hexadécimaux. */
export function newMerchantTransactionId(): string {
  return `WA-${randomBytes(10).toString("hex")}`;
}

/**
 * Crée la commande puis la transaction CinetPay et renvoie l'URL de la page de paiement.
 * Le montant vient toujours du catalogue serveur, jamais du navigateur.
 */
export async function startCheckout(deps: PaymentDeps, values: CheckoutValues): Promise<string> {
  const client = deps.clientFor(values.country.code);
  if (!client) throw new PaymentError(`Paiement indisponible pour ${values.country.name}.`);

  const order = await deps.store.create({
    merchantTransactionId: newMerchantTransactionId(),
    planId: values.plan.id,
    amount: values.plan.priceFcfa,
    currency: values.country.currency,
    country: values.country.code,
    customerFirstName: values.firstName,
    customerLastName: values.lastName,
    customerEmail: values.email,
    customerPhone: values.phone,
  });

  const returnUrl = `${deps.siteUrl}/commande/${order.id}`;
  let payment;
  try {
    payment = await client.createPayment({
      currency: order.currency,
      merchantTransactionId: order.merchantTransactionId,
      amount: order.amount,
      successUrl: returnUrl,
      failedUrl: returnUrl,
      notifyUrl: `${deps.siteUrl}/api/cinetpay/notify`,
      designation: `Forfait eSIM WifiAfrik ${values.plan.label} ${values.plan.title}`,
      clientFirstName: order.customerFirstName,
      clientLastName: order.customerLastName,
      clientEmail: order.customerEmail,
      clientPhoneNumber: order.customerPhone ?? undefined,
    });
  } catch (error) {
    await deps.store.settle(order.id, "failed");
    throw error;
  }

  if (!payment.paymentUrl || !payment.transactionId) {
    await deps.store.settle(order.id, "failed");
    throw new PaymentError(`CinetPay n'a pas renvoyé de page de paiement (statut ${payment.status || "inconnu"}).`);
  }

  await deps.store.attachPayment(order.id, {
    cinetpayTransactionId: payment.transactionId,
    notifyToken: payment.notifyToken,
    paymentUrl: payment.paymentUrl,
  });
  return payment.paymentUrl;
}

/**
 * Interroge CinetPay pour une commande encore « pending » et enregistre le statut final.
 * C'est la seule source de vérité : le statut reçu par webhook ou dans l'URL de retour est ignoré.
 */
export async function syncOrder(deps: PaymentDeps, order: Order): Promise<Order> {
  if (order.status !== "pending" || !order.cinetpayTransactionId) return order;
  const client = deps.clientFor(order.country);
  if (!client) return order;

  const payment = await client.findPayment(order.merchantTransactionId);
  if (
    payment.merchantTransactionId !== order.merchantTransactionId ||
    payment.transactionId !== order.cinetpayTransactionId
  ) {
    throw new PaymentError("La transaction CinetPay ne correspond pas à la commande.");
  }

  const status = orderStatusFromCinetPay(payment.status);
  if (status === "pending") return order;
  return (await deps.store.settle(order.id, status)) ?? (await deps.store.getById(order.id)) ?? order;
}

export type NotificationResult = "processed" | "ignored" | "rejected";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Traite une notification CinetPay : vérifie le notify_token, puis confirme auprès de l'API. */
export async function handleNotification(deps: PaymentDeps, payload: Record<string, unknown>): Promise<NotificationResult> {
  const notifyToken = typeof payload.notify_token === "string" ? payload.notify_token : "";
  const merchantTransactionId =
    typeof payload.merchant_transaction_id === "string" ? payload.merchant_transaction_id : "";
  const transactionId = typeof payload.transaction_id === "string" ? payload.transaction_id : "";
  if (!notifyToken || !merchantTransactionId || !transactionId) return "rejected";

  const order = await deps.store.getByMerchantTransactionId(merchantTransactionId);
  if (!order || !order.notifyToken || !safeEqual(notifyToken, order.notifyToken)) return "rejected";
  if (order.cinetpayTransactionId !== transactionId) return "rejected";
  if (order.status !== "pending") return "ignored";

  await syncOrder(deps, order);
  return "processed";
}

/** URL publique du site : SITE_URL, sinon le domaine de production Vercel. */
export function siteUrl(): string {
  const explicit = process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  throw new Error("SITE_URL doit être défini (URL publique utilisée par CinetPay pour les retours et notifications).");
}
