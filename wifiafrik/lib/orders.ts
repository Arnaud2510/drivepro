import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CountryCode, FcfaCurrency } from "./countries";

/**
 * pending  : commande créée, paiement pas encore effectué ou pas encore déclaré ;
 * declared : (paiement manuel) le client indique avoir payé, à vérifier par un administrateur ;
 * paid / failed : statuts finaux.
 */
export type OrderStatus = "pending" | "declared" | "paid" | "failed";
export type FinalOrderStatus = "paid" | "failed";
export type PaymentProvider = "manual" | "cinetpay";

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
  paymentProvider: PaymentProvider;
  /** Moyen choisi pour un paiement manuel, ex. « orange_money ». */
  paymentMethod: string | null;
  /** Référence de transaction Mobile Money indiquée par le client. */
  payerReference: string | null;
  cinetpayTransactionId: string | null;
  notifyToken: string | null;
  paymentUrl: string | null;
  createdAt: string;
  declaredAt: string | null;
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
  | "paymentProvider"
  | "paymentMethod"
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
  /** Paiement manuel : passe une commande « pending » à « declared ». Renvoie null si elle n'était plus « pending ». */
  declare(id: string, payerReference: string): Promise<Order | null>;
  /**
   * Passe une commande « pending » ou « declared » à un statut final ;
   * sans effet si elle a déjà un statut final (idempotent).
   */
  settle(id: string, status: FinalOrderStatus): Promise<Order | null>;
  /** Commandes les plus récentes ayant l'un des statuts donnés. */
  list(statuses: readonly OrderStatus[], limit: number): Promise<Order[]>;
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
  payment_provider: PaymentProvider;
  payment_method: string | null;
  payer_reference: string | null;
  cinetpay_transaction_id: string | null;
  notify_token: string | null;
  payment_url: string | null;
  created_at: string;
  declared_at: string | null;
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
    paymentProvider: row.payment_provider,
    paymentMethod: row.payment_method,
    payerReference: row.payer_reference,
    cinetpayTransactionId: row.cinetpay_transaction_id,
    notifyToken: row.notify_token,
    paymentUrl: row.payment_url,
    createdAt: row.created_at,
    declaredAt: row.declared_at,
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
        payment_provider: order.paymentProvider,
        payment_method: order.paymentMethod,
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

  async declare(id: string, payerReference: string): Promise<Order | null> {
    if (!isOrderId(id)) return null;
    const { data, error } = await this.db
      .from("orders")
      .update({ status: "declared", payer_reference: payerReference, declared_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle<OrderRow>();
    if (error) throw new Error(`Mise à jour de commande impossible : ${error.message}`);
    return data ? fromRow(data) : null;
  }

  async settle(id: string, status: FinalOrderStatus): Promise<Order | null> {
    if (!isOrderId(id)) return null;
    const { data, error } = await this.db
      .from("orders")
      .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
      .eq("id", id)
      .in("status", ["pending", "declared"])
      .select()
      .maybeSingle<OrderRow>();
    if (error) throw new Error(`Mise à jour de commande impossible : ${error.message}`);
    return data ? fromRow(data) : null;
  }

  async list(statuses: readonly OrderStatus[], limit: number): Promise<Order[]> {
    const { data, error } = await this.db
      .from("orders")
      .select()
      .in("status", [...statuses])
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<OrderRow[]>();
    if (error) throw new Error(`Lecture des commandes impossible : ${error.message}`);
    return (data ?? []).map(fromRow);
  }
}

let store: SupabaseOrderStore | null = null;

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Noms des variables de connexion à Supabase absentes ou mal formées (pour un diagnostic sans secret). */
export function orderStoreConfigProblems(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const problems: string[] = [];
  const url = env.SUPABASE_URL?.trim();
  if (!url) problems.push("SUPABASE_URL est absente.");
  else if (!isHttpUrl(url)) problems.push("SUPABASE_URL doit être une adresse complète, ex. https://xxxx.supabase.co.");
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) problems.push("SUPABASE_SERVICE_ROLE_KEY est absente.");
  return problems;
}

export function orderStore(): OrderStore {
  if (store) return store;
  const problems = orderStoreConfigProblems();
  if (problems.length > 0) throw new Error(`Configuration Supabase incomplète : ${problems.join(" ")}`);
  const url = process.env.SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  store = new SupabaseOrderStore(
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
  return store;
}
