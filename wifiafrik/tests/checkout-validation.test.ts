import { describe, expect, it } from "vitest";
import { normalizePhone, validateCheckout } from "@/lib/checkout-validation";
import { COUNTRIES } from "@/lib/countries";

const ci = COUNTRIES.find((c) => c.code === "CI")!;
const base = {
  planId: "semaine",
  firstName: "Awa",
  lastName: "Diallo",
  email: "Awa@Example.com",
  phone: "",
  country: "CI",
  paymentMethod: "",
};

describe("normalizePhone", () => {
  it("accepte les formats local, international et 00", () => {
    expect(normalizePhone("07 07 00 00 01", ci)).toBe("+2250707000001");
    expect(normalizePhone("+225 0707000001", ci)).toBe("+2250707000001");
    expect(normalizePhone("002250707000001", ci)).toBe("+2250707000001");
  });
  it("refuse un indicatif d'un autre pays", () => {
    expect(normalizePhone("+221770000000", ci)).toBeNull();
  });
});

describe("validateCheckout", () => {
  it("valide et normalise une saisie correcte", () => {
    const r = validateCheckout(base, { countries: ["CI"] });
    expect(r.ok && r.values.email).toBe("awa@example.com");
    expect(r.ok && r.values.plan.priceFcfa).toBe(2500);
    expect(r.ok && r.values.phone).toBeNull();
  });
  it("refuse un forfait inconnu, un pays non configuré et un e-mail invalide", () => {
    const r = validateCheckout({ ...base, planId: "gratuit", country: "SN", email: "x" }, { countries: ["CI"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["country", "email", "planId"]);
  });
});

describe("validateCheckout en paiement manuel", () => {
  const rules = { countries: ["CI" as const], manualMethods: ["orange_money", "wave"] };

  it("exige un moyen de paiement proposé et le numéro de téléphone", () => {
    const r = validateCheckout({ ...base, paymentMethod: "carte" }, rules);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["paymentMethod", "phone"]);
  });

  it("accepte une saisie complète", () => {
    const r = validateCheckout({ ...base, paymentMethod: "wave", phone: "0707000001" }, rules);
    expect(r.ok && r.values.paymentMethod).toBe("wave");
    expect(r.ok && r.values.phone).toBe("+2250707000001");
  });
});
