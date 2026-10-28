import { describe, expect, it, vi } from "vitest";
import { CinetPayClient, CinetPayError, orderStatusFromCinetPay, type CinetPayAccount } from "@/lib/cinetpay";

const account: CinetPayAccount = { country: "CI", apiKey: "k", apiPassword: "p", environment: "sandbox" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const paymentInput = {
  currency: "XOF" as const,
  merchantTransactionId: "WA-1",
  amount: 2500,
  successUrl: "https://s/commande/1",
  failedUrl: "https://s/commande/1",
  notifyUrl: "https://s/api/cinetpay/notify",
  designation: "Forfait",
  clientFirstName: "Awa",
  clientLastName: "Diallo",
  clientEmail: "awa@example.com",
};

describe("CinetPayClient", () => {
  it("s'authentifie puis initialise le paiement sur l'API sandbox", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 300 }))
      .mockResolvedValueOnce(
        json({
          code: 200,
          status: "OK",
          merchant_transaction_id: "WA-1",
          transaction_id: "CP-9",
          notify_token: "nt",
          payment_token: "pt",
          payment_url: "https://pay.cinetpay.net/x",
        }),
      );
    const client = new CinetPayClient(account, fetchMock);

    const res = await client.createPayment(paymentInput);

    expect(res).toEqual({
      status: "OK",
      merchantTransactionId: "WA-1",
      transactionId: "CP-9",
      notifyToken: "nt",
      paymentToken: "pt",
      paymentUrl: "https://pay.cinetpay.net/x",
    });
    const [loginUrl, loginInit] = fetchMock.mock.calls[0];
    expect(loginUrl).toBe("https://api.cinetpay.net/v1/oauth/login");
    expect(JSON.parse(loginInit.body)).toEqual({ api_key: "k", api_password: "p" });
    const [payUrl, payInit] = fetchMock.mock.calls[1];
    expect(payUrl).toBe("https://api.cinetpay.net/v1/payment");
    expect(payInit.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(payInit.body);
    expect(body).toMatchObject({ currency: "XOF", amount: 2500, merchant_transaction_id: "WA-1", lang: "fr" });
    expect(body).not.toHaveProperty("client_phone_number");
  });

  it("réutilise le jeton tant qu'il est valide et le renouvelle une fois s'il est expiré", async () => {
    let now = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: { token: "t1", expires_in: 300 } }))
      .mockResolvedValueOnce(json({ status: "PENDING", merchant_transaction_id: "WA-1", transaction_id: "CP-9" }))
      .mockResolvedValueOnce(json({ status: "PENDING", merchant_transaction_id: "WA-1", transaction_id: "CP-9" }))
      .mockResolvedValueOnce(json({ status: "EXPIRED_TOKEN" }, 401))
      .mockResolvedValueOnce(json({ access_token: "t2", expires_in: 300 }))
      .mockResolvedValueOnce(json({ status: "SUCCESS", merchant_transaction_id: "WA-1", transaction_id: "CP-9" }));
    const client = new CinetPayClient(account, fetchMock, () => now);

    await client.findPayment("WA-1");
    await client.findPayment("WA-1");
    expect(fetchMock).toHaveBeenCalledTimes(3); // un seul login

    now = 10_000;
    const res = await client.findPayment("WA-1");
    expect(res.status).toBe("SUCCESS");
    expect(fetchMock.mock.calls[5][1].headers.Authorization).toBe("Bearer t2");
    expect(fetchMock.mock.calls[5][0]).toBe("https://api.cinetpay.net/v1/payment/WA-1");
  });

  it("utilise l'API de production si demandé et remonte les erreurs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "tok" }))
      .mockResolvedValueOnce(json({ status: "INVALID_PARAMS", description: "amount invalide" }, 422));
    const client = new CinetPayClient({ ...account, environment: "production" }, fetchMock);

    await expect(client.createPayment(paymentInput)).rejects.toThrow(CinetPayError);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.cinetpay.co/v1/oauth/login");
  });
});

describe("orderStatusFromCinetPay", () => {
  it("ne considère payé que le statut SUCCESS", () => {
    expect(orderStatusFromCinetPay("SUCCESS")).toBe("paid");
    expect(orderStatusFromCinetPay("FAILED")).toBe("failed");
    expect(orderStatusFromCinetPay("EXPIRED")).toBe("failed");
    expect(orderStatusFromCinetPay("PENDING")).toBe("pending");
    expect(orderStatusFromCinetPay("INITIATED")).toBe("pending");
    expect(orderStatusFromCinetPay("")).toBe("pending");
  });
});
