/**
 * Paiement manuel par Mobile Money : numéros de réception configurés par variables d'environnement
 * (jamais dans le code). Un moyen n'est proposé que si son numéro est défini.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type ManualMethodId = "orange_money" | "wave" | "mtn_momo" | "moov_money";

export interface ManualPaymentMethod {
  id: ManualMethodId;
  label: string;
  number: string;
}

const METHODS: readonly { id: ManualMethodId; label: string; env: string }[] = [
  { id: "orange_money", label: "Orange Money", env: "PAYMENT_ORANGE_MONEY_NUMBER" },
  { id: "wave", label: "Wave", env: "PAYMENT_WAVE_NUMBER" },
  { id: "mtn_momo", label: "MTN Mobile Money", env: "PAYMENT_MTN_MOMO_NUMBER" },
  { id: "moov_money", label: "Moov Money", env: "PAYMENT_MOOV_MONEY_NUMBER" },
];

export function manualPaymentMethods(env: Env = process.env): ManualPaymentMethod[] {
  return METHODS.flatMap((m) => {
    const number = env[m.env]?.trim();
    return number ? [{ id: m.id, label: m.label, number }] : [];
  });
}

export function findManualMethod(id: string | null, env: Env = process.env): ManualPaymentMethod | undefined {
  return manualPaymentMethods(env).find((m) => m.id === id);
}

/** Nom du titulaire des comptes Mobile Money, affiché au client pour qu'il vérifie le destinataire. */
export function manualPaymentHolder(env: Env = process.env): string | null {
  return env.PAYMENT_HOLDER_NAME?.trim() || null;
}

/** « manual » par défaut ; « cinetpay » pour réactiver le paiement en ligne. */
export function paymentMode(env: Env = process.env): "manual" | "cinetpay" {
  return env.PAYMENT_MODE === "cinetpay" ? "cinetpay" : "manual";
}

/** Référence de transaction saisie par le client (ex. identifiant reçu par SMS). */
export function normalizePayerReference(raw: string): string | null {
  const ref = raw.trim().replace(/\s+/g, " ");
  return ref.length >= 4 && ref.length <= 100 ? ref : null;
}
