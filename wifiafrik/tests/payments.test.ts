import { describe, expect, it, vi } from "vitest";
import type { CheckoutValues } from "@/lib/checkout-validation";
import { COUNTRIES } from "@/lib/countries";
import type { FinalOrderStatus, NewOrder, Order, OrderStatus, OrderStore } from "@/lib/orders";
import {
  createManualOrder,
  declareManualPayment,
  handleNotification,
  reviewManualPayment,
  startCheckout,
  syncOrder,
  type PaymentDeps,
} from "@/lib/payments";
import { PLANS } from "@/lib/plans";

class MemoryStore implements OrderStore {
  orders = new Map<string, Order>();
  private seq = 0;
  async create(o: NewOrder): Promise<Order> {
    const id = `00000000-0000-4000-8000-00000000000${++this.seq}`;
    const order: Order = {
      ...o,
      id,
      status: "pending",
      payerReference: null,
      declaredAt: null,
      cinetpayTransactionId: null,
      notifyToken: null,
      paymentUrl: null,
      createdAt: "now",
      paidAt: null,
    };
    this.orders.set(id, order);
    return order;
  }
  async attachPayment(id: string, p: { cinetpayTransactionId: string; notifyToken: string | null; paymentUrl: string }) {
    Object.assign(this.orders.get(id)!, p);
  }
  async getById(id: string) {
    return this.orders.get(id) ?? null;
  }
  async getByMerchantTransactionId(m: string) {
    return [...this.orders.values()].find((o) => o.merchantTransactionId === m) ?? null;
  }
  async declare(id: string, payerReference: string) {
    const o = this.orders.get(id);
    if (!o || o.status !== "pending") return null;
    Object.assign(o, { status: "declared", payerReference, declaredAt: "now" });
    return o;
  }
  async settle(id: string, status: FinalOrderStatus) {
    const o = this.orders.get(id);
    if (!o || (o.status !== "pending" && o.status !== "declared")) return null;
    o.status = status;
    return o;
  }
  async list(statuses: readonly OrderStatus[]) {
    return [...this.orders.values()].filter((o) => statuses.includes(o.status));
  }
}

const values: CheckoutValues = {
  plan: PLANS[1],
  country: COUNTRIES.find((c) => c.code === "CM")!,
  firstName: "Awa",
  lastName: "Diallo",
  email: "awa@example.com",
  phone: "+237690000000",
  paymentMethod: null,
};

function setup(findStatus = "SUCCESS") {
  const store = new MemoryStore();
  const client = {
    createPayment: vi.fn(async (input: { merchantTransactionId: string }) => ({
      status: "OK",
      merchantTransactionId: input.merchantTransactionId,
      transactionId: "CP-9",
      notifyToken: "secret-token",
      paymentToken: "pt",
      paymentUrl: "https://pay.cinetpay.net/x",
    })),
    findPayment: vi.fn(async (id: string) => ({ status: findStatus, merchantTransactionId: id, transactionId: "CP-9" })),
  };
  const deps: PaymentDeps = { store, clientFor: (c) => (c === "CM" ? client : null), siteUrl: "https://wifiafrik.test" };
  return { store, client, deps };
}

describe("startCheckout", () => {
  it("crée la commande au prix du catalogue et renvoie l'URL de paiement", async () => {
    const { store, client, deps } = setup();
    const url = await startCheckout(deps, values);

    expect(url).toBe("https://pay.cinetpay.net/x");
    const [order] = store.orders.values();
    expect(order).toMatchObject({
      amount: 5000,
      currency: "XAF",
      planId: "mois",
      cinetpayTransactionId: "CP-9",
      paymentProvider: "cinetpay",
    });
    expect(order.merchantTransactionId).toMatch(/^WA-[0-9a-f]{20}$/);
    expect(client.createPayment.mock.calls[0][0]).toMatchObject({
      amount: 5000,
      currency: "XAF",
      successUrl: `https://wifiafrik.test/commande/${order.id}`,
      notifyUrl: "https://wifiafrik.test/api/cinetpay/notify",
      clientPhoneNumber: "+237690000000",
    });
  });

  it("marque la commande en échec si CinetPay refuse", async () => {
    const { store, client, deps } = setup();
    client.createPayment.mockRejectedValueOnce(new Error("refus"));
    await expect(startCheckout(deps, values)).rejects.toThrow("refus");
    expect([...store.orders.values()][0].status).toBe("failed");
  });

  it("refuse un pays sans compte marchand", async () => {
    const { deps } = setup();
    await expect(startCheckout(deps, { ...values, country: COUNTRIES[0] })).rejects.toThrow(/indisponible/);
  });
});

describe("handleNotification", () => {
  async function paidOrder(findStatus = "SUCCESS") {
    const ctx = setup(findStatus);
    await startCheckout(ctx.deps, values);
    const [order] = ctx.store.orders.values();
    return { ...ctx, order };
  }

  it("confirme le paiement auprès de l'API avant de valider la commande", async () => {
    const { deps, order, client } = await paidOrder();
    const res = await handleNotification(deps, {
      notify_token: "secret-token",
      merchant_transaction_id: order.merchantTransactionId,
      transaction_id: "CP-9",
      status: "FAILED", // ignoré : seul l'API fait foi
    });
    expect(res).toBe("processed");
    expect(client.findPayment).toHaveBeenCalledWith(order.merchantTransactionId);
    expect(order.status).toBe("paid");
  });

  it("rejette un notify_token invalide sans interroger CinetPay", async () => {
    const { deps, order, client } = await paidOrder();
    const res = await handleNotification(deps, {
      notify_token: "faux",
      merchant_transaction_id: order.merchantTransactionId,
      transaction_id: "CP-9",
    });
    expect(res).toBe("rejected");
    expect(client.findPayment).not.toHaveBeenCalled();
    expect(order.status).toBe("pending");
  });

  it("est idempotent : une seconde notification est ignorée", async () => {
    const { deps, order } = await paidOrder();
    const payload = { notify_token: "secret-token", merchant_transaction_id: order.merchantTransactionId, transaction_id: "CP-9" };
    await handleNotification(deps, payload);
    expect(await handleNotification(deps, payload)).toBe("ignored");
  });

  it("laisse la commande en attente tant que CinetPay n'a pas de statut final", async () => {
    const { deps, order } = await paidOrder("PENDING");
    expect(await syncOrder(deps, order)).toMatchObject({ status: "pending" });
  });

  it("refuse une réponse CinetPay qui ne correspond pas à la commande", async () => {
    const { deps, order, client } = await paidOrder();
    client.findPayment.mockResolvedValueOnce({ status: "SUCCESS", merchantTransactionId: order.merchantTransactionId, transactionId: "AUTRE" });
    await expect(syncOrder(deps, order)).rejects.toThrow(/ne correspond pas/);
    expect(order.status).toBe("pending");
  });
});

describe("paiement manuel", () => {
  const manualValues: CheckoutValues = { ...values, paymentMethod: "orange_money" };

  it("crée la commande au prix du catalogue, puis enregistre la déclaration du client", async () => {
    const store = new MemoryStore();
    const order = await createManualOrder(store, manualValues);
    expect(order).toMatchObject({ amount: 5000, paymentProvider: "manual", paymentMethod: "orange_money", status: "pending" });

    const declared = await declareManualPayment(store, order.id, "MP241028.1530.A12345");
    expect(declared).toMatchObject({ status: "declared", payerReference: "MP241028.1530.A12345" });

    // Une seconde déclaration ne remplace pas la première.
    const again = await declareManualPayment(store, order.id, "AUTRE");
    expect(again.payerReference).toBe("MP241028.1530.A12345");
  });

  it("laisse l'administrateur valider ou refuser, une seule fois", async () => {
    const store = new MemoryStore();
    const order = await createManualOrder(store, manualValues);
    await declareManualPayment(store, order.id, "REF-1234");

    expect(await reviewManualPayment(store, order.id, "paid")).toMatchObject({ status: "paid" });
    expect(await reviewManualPayment(store, order.id, "failed")).toBeNull();
    expect(order.status).toBe("paid");
  });

  it("n'agit pas sur une commande payée en ligne", async () => {
    const { store, deps } = setup();
    await startCheckout(deps, values);
    const [order] = store.orders.values();
    expect(await reviewManualPayment(store, order.id, "paid")).toBeNull();
    await expect(declareManualPayment(store, order.id, "REF-1234")).rejects.toThrow(/introuvable/);
    expect(order.status).toBe("pending");
  });
});
