import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CountryCode, FcfaCurrency } from "./countries";

export type OrderStatus = "pending" | "paid" | "failed";

export interface Order {
  id: string;
  merchantTransactionId: string;
  planId: string;
  amount: number;
  currency: FcfaCurrency;
  country: CountryCode;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string | null;
  status: OrderStatus;
  cinetpayTransactionId: string | null;
  notifyToken: string | null;
  paymentUrl: string | null;
  createdAt: string;
  paidAt: string | null;
}

export type NewOrder = Pick<
  Order,
  | "merchantTransactionId"
  | "planId"
  | "amount"
  | "currency"
  | "country"
  | "customerFirstName"
  | "customerLastName"
  | "customerEmail"
  | "customerPhone"
>;

export interface PaymentAttachment {
  cinetpayTransactionId: string;
  notifyToken: string | null;
  paymentUrl: string;
}

export interface OrderStore {
  create(order: NewOrder): Promise<Order>;
  attachPayment(id: string, payment: PaymentAttachment): Promise<void>;
  getById(id: string): Promise<Order | null>;
  getByMerchantTransactionId(merchantTransactionId: string): Promise<Order | null>;
  /** Passe une commande « pending » à un statut final ; sans effet si elle ne l'est plus (idempotent). */
  settle(id: string, status: Exclude<OrderStatus, "pending">): Promise<Order | null>;
}

interface OrderRow {
  id: string;
  merchant_transaction_id: string;
  plan_id: string;
  amount: number;
  currency: FcfaCurrency;
  country: CountryCode;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string | null;
  status: OrderStatus;
  cinetpay_transaction_id: string | null;
  notify_token: string | null;
  payment_url: string | null;
  created_at: string;
  paid_at: string | null;
}

function fromRow(row: OrderRow): Order {
  return {
    id: row.id,
    merchantTransactionId: row.merchant_transaction_id,
    planId: row.plan_id,
    amount: row.amount,
    currency: row.currency,
    country: row.country,
    customerFirstName: row.customer_first_name,
    customerLastName: row.customer_last_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    status: row.status,
    cinetpayTransactionId: row.cinetpay_transaction_id,
    notifyToken: row.notify_token,
    paymentUrl: row.payment_url,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Accès à la table `orders` avec la clé service_role : à n'utiliser que côté serveur. */
export class SupabaseOrderStore implements OrderStore {
  constructor(private readonly db: SupabaseClient) {}

  async create(order: NewOrder): Promise<Order> {
    const { data, error } = await this.db
      .from("orders")
      .insert({
        merchant_transaction_id: order.merchantTransactionId,
        plan_id: order.planId,
        amount: order.amount,
        currency: order.currency,
        country: order.country,
        customer_first_name: order.customerFirstName,
        customer_last_name: order.customerLastName,
        customer_email: order.customerEmail,
        customer_phone: order.customerPhone,
      })
      .select()
      .single<OrderRow>();
    if (error) throw new Error(`Création de commande impossible : ${error.message}`);
    return fromRow(data);
  }

  async attachPayment(id: string, payment: PaymentAttachment): Promise<void> {
    const { error } = await this.db
      .from("orders")
      .update({
        cinetpay_transaction_id: payment.cinetpayTransactionId,
        notify_token: payment.notifyToken,
        payment_url: payment.paymentUrl,
      })
      .eq("id", id);
    if (error) throw new Error(`Mise à jour de commande impossible : ${error.message}`);
  }

  async getById(id: string): Promise<Order | null> {
    if (!isOrderId(id)) return null;
    const { data, error } = await this.db.from("orders").select().eq("id", id).maybeSingle<OrderRow>();
    if (error) throw new Error(`Lecture de commande impossible : ${error.message}`);
    return data ? fromRow(data) : null;
  }

  async getByMerchantTransactionId(merchantTransactionId: string): Promise<Order | null> {
    const { data, error } = await this.db
      .from("orders")
      .select()
      .eq("merchant_transaction_id", merchantTransactionId)
      .maybeSingle<OrderRow>();
    if (error) throw new Error(`Lecture de commande impossible : ${error.message}`);
    return data ? fromRow(data) : null;
  }

  async settle(id: string, status: Exclude<OrderStatus, "pending">): Promise<Order | null> {
    const { data, error } = await this.db
      .from("orders")
      .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle<OrderRow>();
    if (error) throw new Error(`Mise à jour de commande impossible : ${error.message}`);
    return data ? fromRow(data) : null;
  }
}

let store: SupabaseOrderStore | null = null;

export function orderStore(): OrderStore {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis.");
  store = new SupabaseOrderStore(
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
  return store;
}
