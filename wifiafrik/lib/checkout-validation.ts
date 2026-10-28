import { findCountry, type Country, type CountryCode } from "./countries";
import { PLANS, type Plan } from "./plans";

export type CheckoutField = "planId" | "firstName" | "lastName" | "email" | "phone" | "country";

export interface CheckoutValues {
  plan: Plan;
  country: Country;
  firstName: string;
  lastName: string;
  email: string;
  /** Format E.164, ex. +2250707000001. */
  phone: string | null;
}

export type CheckoutValidation =
  | { ok: true; values: CheckoutValues }
  | { ok: false; errors: Partial<Record<CheckoutField, string>> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalise un numéro saisi localement ou au format international vers E.164 pour le pays donné. */
export function normalizePhone(raw: string, country: Country): string | null {
  const compact = raw.replace(/[\s.\-()]/g, "");
  if (compact === "") return null;
  const digitsOnly = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  const e164 = digitsOnly.startsWith("+") ? digitsOnly : `${country.callingCode}${digitsOnly}`;
  if (!/^\+\d{8,15}$/.test(e164) || !e164.startsWith(country.callingCode)) return null;
  return e164;
}

export function validateCheckout(
  input: Record<CheckoutField, string>,
  enabledCountries: readonly CountryCode[],
): CheckoutValidation {
  const errors: Partial<Record<CheckoutField, string>> = {};
  const plan = PLANS.find((p) => p.id === input.planId);
  if (!plan) errors.planId = "Forfait inconnu.";

  const country = findCountry(input.country);
  if (!country || !enabledCountries.includes(country.code)) errors.country = "Choisissez un pays de paiement.";

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  if (firstName.length < 2 || firstName.length > 100) errors.firstName = "Prénom requis (2 caractères minimum).";
  if (lastName.length < 2 || lastName.length > 100) errors.lastName = "Nom requis (2 caractères minimum).";
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = "Adresse e-mail invalide.";

  let phone: string | null = null;
  if (country && input.phone.trim() !== "") {
    phone = normalizePhone(input.phone, country);
    if (!phone) errors.phone = `Numéro invalide pour ce pays (indicatif ${country.callingCode}).`;
  }

  if (!plan || !country || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values: { plan, country, firstName, lastName, email, phone } };
}
