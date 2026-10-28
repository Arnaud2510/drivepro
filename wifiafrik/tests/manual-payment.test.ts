import { describe, expect, it } from "vitest";
import { manualPaymentMethods, normalizePayerReference, paymentMode } from "@/lib/manual-payment";

describe("configuration du paiement manuel", () => {
  it("ne propose que les moyens dont le numéro est défini", () => {
    const env = { PAYMENT_WAVE_NUMBER: " +225 07 00 00 00 01 ", PAYMENT_MTN_MOMO_NUMBER: "" };
    expect(manualPaymentMethods(env)).toEqual([{ id: "wave", label: "Wave", number: "+225 07 00 00 00 01" }]);
  });

  it("utilise le paiement manuel par défaut", () => {
    expect(paymentMode({})).toBe("manual");
    expect(paymentMode({ PAYMENT_MODE: "cinetpay" })).toBe("cinetpay");
  });

  it("nettoie la référence de transaction", () => {
    expect(normalizePayerReference("  MP24  1028 ")).toBe("MP24 1028");
    expect(normalizePayerReference("abc")).toBeNull();
  });
});

describe("diagnostic de configuration Supabase", () => {
  it("signale les variables absentes ou mal formées", async () => {
    const { orderStoreConfigProblems } = await import("@/lib/orders");
    expect(orderStoreConfigProblems({})).toHaveLength(2);
    expect(orderStoreConfigProblems({ SUPABASE_URL: "rwuaznygtoifzqggvlnr.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" })).toEqual([
      "SUPABASE_URL doit ressembler à https://xxxx.supabase.co (sans espace ni chemin).",
    ]);
    expect(orderStoreConfigProblems({ SUPABASE_URL: " https://abc.supabase.co ", SUPABASE_SERVICE_ROLE_KEY: "k" })).toEqual([]);
  });
});
