import { describe, expect, it, vi } from "vitest";
import type { CheckoutValues } from "@/lib/checkout-validation";
import { COUNTRIES } from "@/lib/countries";
import type { NewOrder, Order, OrderStore } from "@/lib/orders";
import { handleNotification, startCheckout, syncOrder, type PaymentDeps } from "@/lib/payments";
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
  async settle(id: string, status: "paid" | "failed") {
    const o = this.orders.get(id);
    if (!o || o.status !== "pending") return null;
    o.status = status;
    return o;
  }
}

const values: CheckoutValues = {
  plan: PLANS[1],
  country: COUNTRIES.find((c) => c.code === "CM")!,
  firstName: "Awa",
  lastName: "Diallo",
  email: "awa@example.com",
  phone: "+237690000000",
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
    expect(order).toMatchObject({ amount: 5000, currency: "XAF", planId: "mois", cinetpayTransactionId: "CP-9" });
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
