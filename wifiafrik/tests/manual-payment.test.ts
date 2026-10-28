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
